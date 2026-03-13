/**
 * MessagingContext
 * Manages the WebSocket connection, message fan-out, and offline persistence.
 *
 * Architecture:
 *   WebSocket  ──►  ChatConsumer (Django Channels / Redis)
 *               ◄──
 *
 * Offline persistence: AsyncStorage under key schema
 *   messages:<conversationId>  →  JSON array (newest-first, capped at 200)
 *   conversations:list         →  JSON array of Conversation objects
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { AppState } from 'react-native';

import { useAuth } from './AuthContext';

const WS_BASE_URL = process.env.WS_URL ?? 'wss://api.securechat.example.com/ws/chat/';
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000]; // exponential back-off caps
const OFFLINE_MSG_CAP = 200; // max messages cached per conversation

// ─────────────────────────────────────────────────────── State shape

/**
 * @typedef {{ [conversationId: string]: import('../api/types').Message[] }} MessagesMap
 * @typedef {{ [conversationId: string]: boolean }} TypingMap
 */

const ACTIONS = {
  SET_WS_STATUS: 'SET_WS_STATUS',
  SET_CONVERSATIONS: 'SET_CONVERSATIONS',
  PREPEND_MESSAGES: 'PREPEND_MESSAGES',
  APPEND_MESSAGE: 'APPEND_MESSAGE',
  SET_TYPING: 'SET_TYPING',
  MARK_READ: 'MARK_READ',
};

function messagingReducer(state, { type, payload }) {
  switch (type) {
    case ACTIONS.SET_WS_STATUS:
      return { ...state, wsStatus: payload };

    case ACTIONS.SET_CONVERSATIONS:
      return { ...state, conversations: payload };

    case ACTIONS.PREPEND_MESSAGES: {
      const { conversationId, messages } = payload;
      const existing = state.messages[conversationId] ?? [];
      // Deduplicate by id
      const ids = new Set(existing.map(m => m.id));
      const fresh = messages.filter(m => !ids.has(m.id));
      return {
        ...state,
        messages: {
          ...state.messages,
          [conversationId]: [...fresh, ...existing],
        },
      };
    }

    case ACTIONS.APPEND_MESSAGE: {
      const { conversationId, message } = payload;
      const existing = state.messages[conversationId] ?? [];
      if (existing.some(m => m.id === message.id)) return state;
      return {
        ...state,
        messages: {
          ...state.messages,
          [conversationId]: [...existing, message],
        },
      };
    }

    case ACTIONS.SET_TYPING:
      return {
        ...state,
        typing: {
          ...state.typing,
          [payload.conversationId]: payload.isTyping,
        },
      };

    case ACTIONS.MARK_READ:
      return state; // receipt UI state handled locally per screen

    default:
      return state;
  }
}

const initialState = {
  wsStatus: 'disconnected', // 'connecting' | 'connected' | 'disconnected' | 'error'
  conversations: [],
  messages: {},
  typing: {},
};

// ─────────────────────────────────────────────────────── Context

const MessagingContext = createContext(null);

export function MessagingProvider({ children }) {
  const { accessToken, status: authStatus } = useAuth();
  const [state, dispatch] = useReducer(messagingReducer, initialState);

  const ws = useRef(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef(null);
  const pendingQueue = useRef([]); // messages queued while offline

  // ───────── WebSocket lifecycle

  const connect = useCallback(() => {
    if (!accessToken) return;
    if (ws.current?.readyState === WebSocket.OPEN) return;

    dispatch({ type: ACTIONS.SET_WS_STATUS, payload: 'connecting' });

    const socket = new WebSocket(`${WS_BASE_URL}?token=${accessToken}`);
    ws.current = socket;

    socket.onopen = () => {
      dispatch({ type: ACTIONS.SET_WS_STATUS, payload: 'connected' });
      reconnectAttempt.current = 0;

      // Flush queued messages
      while (pendingQueue.current.length > 0) {
        const frame = pendingQueue.current.shift();
        socket.send(JSON.stringify(frame));
      }
    };

    socket.onmessage = ({ data }) => {
      try {
        handleServerFrame(JSON.parse(data));
      } catch {
        // Malformed frame — ignore silently
      }
    };

    socket.onerror = () => {
      dispatch({ type: ACTIONS.SET_WS_STATUS, payload: 'error' });
    };

    socket.onclose = () => {
      dispatch({ type: ACTIONS.SET_WS_STATUS, payload: 'disconnected' });
      scheduleReconnect();
    };
  }, [accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const disconnect = useCallback(() => {
    clearTimeout(reconnectTimer.current);
    ws.current?.close();
    ws.current = null;
  }, []);

  function scheduleReconnect() {
    const delay =
      RECONNECT_DELAYS[
        Math.min(reconnectAttempt.current, RECONNECT_DELAYS.length - 1)
      ];
    reconnectAttempt.current += 1;
    reconnectTimer.current = setTimeout(connect, delay);
  }

  // ───────── Server frame router

  function handleServerFrame(frame) {
    switch (frame.type) {
      case 'message.new':
        dispatch({
          type: ACTIONS.APPEND_MESSAGE,
          payload: { conversationId: frame.conversation_id, message: frame },
        });
        persistMessageOffline(frame.conversation_id, frame);
        break;

      case 'typing.start':
        dispatch({
          type: ACTIONS.SET_TYPING,
          payload: { conversationId: frame.conversation_id, isTyping: true },
        });
        break;

      case 'typing.stop':
        dispatch({
          type: ACTIONS.SET_TYPING,
          payload: { conversationId: frame.conversation_id, isTyping: false },
        });
        break;

      case 'message.read':
        dispatch({ type: ACTIONS.MARK_READ, payload: frame });
        break;

      case 'error':
        console.warn('[WS] Server error:', frame.code);
        break;

      default:
        break;
    }
  }

  // ───────── Send helpers

  function sendFrame(frame) {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(frame));
    } else {
      // Queue for reconnect delivery
      pendingQueue.current.push(frame);
    }
  }

  const sendMessage = useCallback(
    ({ conversationId, ciphertext, iv, senderPublicKey, messageType = 'text', replyToId }) => {
      sendFrame({
        type: 'message.send',
        conversation_id: conversationId,
        ciphertext,
        iv,
        sender_public_key: senderPublicKey,
        message_type: messageType,
        reply_to_id: replyToId ?? null,
      });
    },
    [],
  );

  const sendTyping = useCallback((conversationId, isTyping) => {
    sendFrame({
      type: isTyping ? 'typing.start' : 'typing.stop',
      conversation_id: conversationId,
    });
  }, []);

  const markRead = useCallback((conversationId, messageId) => {
    sendFrame({ type: 'message.read', conversation_id: conversationId, message_id: messageId });
  }, []);

  // ───────── Offline persistence (AsyncStorage)

  async function persistMessageOffline(conversationId, message) {
    try {
      const key = `messages:${conversationId}`;
      const raw = await AsyncStorage.getItem(key);
      const cached = raw ? JSON.parse(raw) : [];
      const updated = [message, ...cached].slice(0, OFFLINE_MSG_CAP);
      await AsyncStorage.setItem(key, JSON.stringify(updated));
    } catch {
      // Storage failure is non-fatal
    }
  }

  const loadCachedMessages = useCallback(async conversationId => {
    try {
      const raw = await AsyncStorage.getItem(`messages:${conversationId}`);
      if (!raw) return [];
      const messages = JSON.parse(raw);
      dispatch({
        type: ACTIONS.PREPEND_MESSAGES,
        payload: { conversationId, messages },
      });
      return messages;
    } catch {
      return [];
    }
  }, []);

  // ───────── Lifecycle: connect on auth, disconnect on sign-out

  useEffect(() => {
    if (authStatus === 'authenticated' && accessToken) {
      connect();
    } else {
      disconnect();
    }
    return disconnect;
  }, [authStatus, accessToken, connect, disconnect]);

  // Reconnect on app foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      if (nextState === 'active' && authStatus === 'authenticated') {
        connect();
      }
    });
    return () => sub.remove();
  }, [authStatus, connect]);

  const value = useMemo(
    () => ({
      ...state,
      sendMessage,
      sendTyping,
      markRead,
      loadCachedMessages,
      dispatch,
    }),
    [state, sendMessage, sendTyping, markRead, loadCachedMessages],
  );

  return (
    <MessagingContext.Provider value={value}>{children}</MessagingContext.Provider>
  );
}

export function useMessaging() {
  const ctx = useContext(MessagingContext);
  if (!ctx) throw new Error('useMessaging must be used inside <MessagingProvider>');
  return ctx;
}
