/**
 * AuthContext
 * Manages JWT authentication state, biometric unlock, and secure token storage.
 *
 * Token storage delegates to the SecureTokenStorage native module which wraps:
 *  - iOS:     Keychain Services (via Keychain Access Groups)
 *  - Android: Android Keystore + EncryptedSharedPreferences
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from 'react';
import { Alert, NativeModules } from 'react-native';

import { apiClient } from '../api/client';

const { SecureTokenStorage, BiometricAuth } = NativeModules;

// ─────────────────────────────────────────────────────── Types

/**
 * @typedef {Object} AuthState
 * @property {'initialising' | 'authenticated' | 'unauthenticated'} status
 * @property {{ id: string, username: string, displayName: string, publicKey: string } | null} user
 * @property {string | null} accessToken
 * @property {boolean} biometricEnabled
 */

// ─────────────────────────────────────────────────────── Reducer

const ACTIONS = {
  RESTORE: 'RESTORE',
  SIGN_IN: 'SIGN_IN',
  SIGN_OUT: 'SIGN_OUT',
  UPDATE_USER: 'UPDATE_USER',
};

function authReducer(state, action) {
  switch (action.type) {
    case ACTIONS.RESTORE:
      return {
        ...state,
        status: action.payload.accessToken ? 'authenticated' : 'unauthenticated',
        user: action.payload.user ?? null,
        accessToken: action.payload.accessToken ?? null,
        biometricEnabled: action.payload.biometricEnabled ?? false,
      };
    case ACTIONS.SIGN_IN:
      return {
        ...state,
        status: 'authenticated',
        user: action.payload.user,
        accessToken: action.payload.accessToken,
      };
    case ACTIONS.SIGN_OUT:
      return { ...state, status: 'unauthenticated', user: null, accessToken: null };
    case ACTIONS.UPDATE_USER:
      return { ...state, user: { ...state.user, ...action.payload } };
    default:
      return state;
  }
}

const initialState = {
  status: 'initialising',
  user: null,
  accessToken: null,
  biometricEnabled: false,
};

// ─────────────────────────────────────────────────────── Context

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // ───────── Bootstrap: restore tokens from Keychain / Keystore on mount

  useEffect(() => {
    async function bootstrap() {
      try {
        const [tokenJson, biometricEnabled] = await Promise.all([
          SecureTokenStorage.getTokens(),
          BiometricAuth.isEnabled(),
        ]);

        if (!tokenJson) {
          dispatch({ type: ACTIONS.RESTORE, payload: {} });
          return;
        }

        const { accessToken, refreshToken, user } = JSON.parse(tokenJson);

        // Verify / refresh the access token silently
        const freshAccess = await refreshAccessToken(refreshToken);

        if (freshAccess) {
          apiClient.setToken(freshAccess);
          dispatch({
            type: ACTIONS.RESTORE,
            payload: { accessToken: freshAccess, user, biometricEnabled },
          });
        } else {
          await SecureTokenStorage.deleteTokens();
          dispatch({ type: ACTIONS.RESTORE, payload: {} });
        }
      } catch {
        dispatch({ type: ACTIONS.RESTORE, payload: {} });
      }
    }

    bootstrap();
  }, []);

  // ───────── Sign in

  const signIn = useCallback(async ({ username, password }) => {
    const data = await apiClient.post('/auth/token/', { username, password });
    const { access, refresh, user } = data;

    await SecureTokenStorage.saveTokens(
      JSON.stringify({ accessToken: access, refreshToken: refresh, user }),
    );

    apiClient.setToken(access);

    dispatch({ type: ACTIONS.SIGN_IN, payload: { user, accessToken: access } });

    return user;
  }, []);

  // ───────── Biometric unlock (re-authenticates from stored creds)

  const biometricUnlock = useCallback(async () => {
    const result = await BiometricAuth.authenticate({
      reason: 'Unlock SecureChat',
      fallbackLabel: 'Use Passcode',
    });

    if (!result.success) {
      throw new Error(result.error ?? 'Biometric authentication failed');
    }

    const tokenJson = await SecureTokenStorage.getTokens();
    if (!tokenJson) throw new Error('No stored credentials');

    const { refreshToken, user } = JSON.parse(tokenJson);
    const freshAccess = await refreshAccessToken(refreshToken);

    if (!freshAccess) throw new Error('Session expired — please log in again');

    apiClient.setToken(freshAccess);
    dispatch({ type: ACTIONS.SIGN_IN, payload: { user, accessToken: freshAccess } });
  }, []);

  // ───────── Sign out

  const signOut = useCallback(async () => {
    try {
      const tokenJson = await SecureTokenStorage.getTokens();
      if (tokenJson) {
        const { refreshToken } = JSON.parse(tokenJson);
        await apiClient.post('/auth/logout/', { refresh: refreshToken }).catch(() => {});
      }
    } finally {
      await SecureTokenStorage.deleteTokens();
      apiClient.clearToken();
      dispatch({ type: ACTIONS.SIGN_OUT });
    }
  }, []);

  // ───────── Update user profile slice

  const updateUser = useCallback(updates => {
    dispatch({ type: ACTIONS.UPDATE_USER, payload: updates });
  }, []);

  const value = useMemo(
    () => ({ ...state, signIn, signOut, biometricUnlock, updateUser }),
    [state, signIn, signOut, biometricUnlock, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

// ─────────────────────────────────────────────────────── Helpers

async function refreshAccessToken(refreshToken) {
  try {
    const data = await apiClient.post('/auth/token/refresh/', { refresh: refreshToken });
    return data.access ?? null;
  } catch {
    return null;
  }
}
