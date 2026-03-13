"""
SecureChat WebSocket Consumer
Handles real-time bidirectional messaging via Django Channels + Redis.

Throughput target: ~10,000 msgs/s  |  p95 latency: ≤ 30ms
"""

import json
import logging
from datetime import datetime, timezone

from channels.db import database_sync_to_async
from channels.exceptions import DenyConnection, StopConsumer
from channels.generic.websocket import AsyncWebsocketConsumer

from securechat.api.models import Conversation, Message, MessageReceipt, User

logger = logging.getLogger(__name__)


class ChatConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for a single authenticated user session.

    Group naming convention:
        conversation_<uuid>  — fan-out to all participants of a conversation
        user_<uuid>          — direct delivery for presence / receipts
    """

    # ------------------------------------------------------------------ connect

    async def connect(self):
        self.user = self.scope.get("user")
        if not self.user or not self.user.is_authenticated:
            raise DenyConnection("Authentication required")

        self.user_group = f"user_{self.user.id}"

        # Join per-user group (presence + direct delivery)
        await self.channel_layer.group_add(self.user_group, self.channel_name)

        # Join all active conversation groups
        conversation_ids = await self._get_conversation_ids()
        self.conversation_groups = [f"conversation_{cid}" for cid in conversation_ids]
        for group in self.conversation_groups:
            await self.channel_layer.group_add(group, self.channel_name)

        await self.accept()
        await self._set_online(True)

        logger.info("WS connect: user=%s channel=%s", self.user.id, self.channel_name)

    # ----------------------------------------------------------------- disconnect

    async def disconnect(self, close_code):
        if hasattr(self, "user") and self.user.is_authenticated:
            await self._set_online(False)
            await self.channel_layer.group_discard(self.user_group, self.channel_name)
            for group in getattr(self, "conversation_groups", []):
                await self.channel_layer.group_discard(group, self.channel_name)
            logger.info("WS disconnect: user=%s code=%s", self.user.id, close_code)
        raise StopConsumer()

    # ----------------------------------------------------------------- receive

    async def receive(self, text_data=None, bytes_data=None):
        """Route incoming frames to typed handlers."""
        if not text_data:
            return

        try:
            payload = json.loads(text_data)
            event_type = payload.get("type")
        except (json.JSONDecodeError, AttributeError):
            await self._send_error("invalid_json")
            return

        handlers = {
            "message.send": self._handle_send,
            "message.read": self._handle_read,
            "typing.start": self._handle_typing,
            "typing.stop": self._handle_typing,
            "presence.ping": self._handle_ping,
        }

        handler = handlers.get(event_type)
        if handler:
            await handler(payload)
        else:
            await self._send_error(f"unknown_type:{event_type}")

    # ---------------------------------------------------------- outbound helpers

    async def chat_message(self, event):
        """Relay a fan-out message event to this WebSocket client."""
        await self.send(text_data=json.dumps(event["message"]))

    async def typing_indicator(self, event):
        await self.send(text_data=json.dumps(event["data"]))

    async def presence_update(self, event):
        await self.send(text_data=json.dumps(event["data"]))

    async def receipt_update(self, event):
        await self.send(text_data=json.dumps(event["data"]))

    # ----------------------------------------------------------- handler methods

    async def _handle_send(self, payload: dict):
        """
        Persist an E2E-encrypted message and fan it out to conversation members.
        The server stores the opaque ciphertext only — no decryption occurs here.
        """
        conversation_id = payload.get("conversation_id")
        ciphertext = payload.get("ciphertext")
        iv = payload.get("iv")
        sender_public_key = payload.get("sender_public_key")
        message_type = payload.get("message_type", "text")
        reply_to_id = payload.get("reply_to_id")

        if not all([conversation_id, ciphertext, iv, sender_public_key]):
            await self._send_error("missing_fields")
            return

        # Verify participation without hitting DB if cached
        if not await self._is_participant(conversation_id):
            await self._send_error("not_participant")
            return

        msg = await self._persist_message(
            conversation_id=conversation_id,
            ciphertext=ciphertext,
            iv=iv,
            sender_public_key=sender_public_key,
            message_type=message_type,
            reply_to_id=reply_to_id,
        )

        frame = {
            "type": "chat_message",
            "message": {
                "type": "message.new",
                "id": str(msg.id),
                "conversation_id": conversation_id,
                "sender_id": str(self.user.id),
                "ciphertext": ciphertext,
                "iv": iv,
                "sender_public_key": sender_public_key,
                "message_type": message_type,
                "reply_to_id": reply_to_id,
                "created_at": msg.created_at.isoformat(),
            },
        }

        await self.channel_layer.group_send(f"conversation_{conversation_id}", frame)

    async def _handle_read(self, payload: dict):
        """Mark a message as read and broadcast a receipt to the sender's group."""
        message_id = payload.get("message_id")
        if not message_id:
            return

        receipt = await self._mark_read(message_id)
        if not receipt:
            return

        await self.channel_layer.group_send(
            f"user_{receipt['sender_id']}",
            {
                "type": "receipt_update",
                "data": {
                    "type": "message.read",
                    "message_id": message_id,
                    "reader_id": str(self.user.id),
                    "read_at": receipt["read_at"],
                },
            },
        )

    async def _handle_typing(self, payload: dict):
        conversation_id = payload.get("conversation_id")
        if not conversation_id:
            return

        await self.channel_layer.group_send(
            f"conversation_{conversation_id}",
            {
                "type": "typing_indicator",
                "data": {
                    "type": payload.get("type"),  # typing.start / typing.stop
                    "conversation_id": conversation_id,
                    "user_id": str(self.user.id),
                },
            },
        )

    async def _handle_ping(self, _payload):
        await self.send(text_data=json.dumps({"type": "presence.pong"}))

    # ---------------------------------------------------- DB helpers (sync→async)

    @database_sync_to_async
    def _get_conversation_ids(self):
        return list(
            self.user.conversations.values_list("id", flat=True)
        )

    @database_sync_to_async
    def _is_participant(self, conversation_id: str) -> bool:
        return self.user.conversations.filter(id=conversation_id).exists()

    @database_sync_to_async
    def _persist_message(self, **kwargs) -> Message:
        reply_to_id = kwargs.pop("reply_to_id", None)
        conversation_id = kwargs.pop("conversation_id")
        msg = Message.objects.create(
            conversation_id=conversation_id,
            sender=self.user,
            reply_to_id=reply_to_id,
            **kwargs,
        )
        # Bump conversation.updated_at for ordering
        Conversation.objects.filter(id=conversation_id).update(
            updated_at=datetime.now(timezone.utc)
        )
        return msg

    @database_sync_to_async
    def _set_online(self, status: bool):
        User.objects.filter(id=self.user.id).update(
            is_online=status,
            last_seen=datetime.now(timezone.utc) if not status else None,
        )

    @database_sync_to_async
    def _mark_read(self, message_id: str) -> dict | None:
        try:
            msg = Message.objects.select_related("sender").get(id=message_id)
        except Message.DoesNotExist:
            return None

        now = datetime.now(timezone.utc)
        MessageReceipt.objects.update_or_create(
            message=msg,
            user=self.user,
            defaults={"read_at": now, "delivered_at": now},
        )
        return {
            "sender_id": str(msg.sender_id),
            "read_at": now.isoformat(),
        }

    # --------------------------------------------------------------- utilities

    async def _send_error(self, code: str):
        await self.send(text_data=json.dumps({"type": "error", "code": code}))
