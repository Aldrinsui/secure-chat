"""
SecureChat API Models
All message content is stored as E2E-encrypted ciphertext.
The server never has access to plaintext.
"""

import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Extended user with public key for E2E encryption key exchange."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    display_name = models.CharField(max_length=60, blank=True)
    # X25519 public key for Diffie-Hellman key exchange (Base64-encoded)
    public_key = models.TextField(blank=True)
    avatar_url = models.URLField(blank=True)
    is_online = models.BooleanField(default=False)
    last_seen = models.DateTimeField(null=True, blank=True)
    # Push notification token for offline message delivery
    fcm_token = models.TextField(blank=True)
    apns_token = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "users"
        indexes = [
            models.Index(fields=["username"]),
            models.Index(fields=["is_online"]),
        ]

    def __str__(self):
        return self.username


class Conversation(models.Model):
    """
    A conversation between 2+ participants.
    Stores metadata only — no plaintext content ever touches this model.
    """

    TYPE_DIRECT = "direct"
    TYPE_GROUP = "group"
    TYPE_CHOICES = [(TYPE_DIRECT, "Direct"), (TYPE_GROUP, "Group")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation_type = models.CharField(
        max_length=10, choices=TYPE_CHOICES, default=TYPE_DIRECT
    )
    name = models.CharField(max_length=100, blank=True)  # for group chats
    participants = models.ManyToManyField(
        User, through="ConversationParticipant", related_name="conversations"
    )
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name="created_conversations"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "conversations"
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["updated_at"]),
            models.Index(fields=["conversation_type"]),
        ]

    def __str__(self):
        return f"Conversation({self.id}, {self.conversation_type})"


class ConversationParticipant(models.Model):
    """Through model — tracks per-participant read state."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name="participant_set"
    )
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="participant_set"
    )
    last_read_at = models.DateTimeField(null=True, blank=True)
    is_admin = models.BooleanField(default=False)
    joined_at = models.DateTimeField(auto_now_add=True)
    muted_until = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "conversation_participants"
        unique_together = [("conversation", "user")]
        indexes = [
            models.Index(fields=["user", "conversation"]),
        ]


class Message(models.Model):
    """
    A single message.
    `ciphertext` is the AES-GCM encrypted payload produced by the client.
    `iv` (initialisation vector) and `sender_public_key` allow recipients to derive
    the shared secret and decrypt locally — the server stores opaque bytes only.
    """

    STATUS_SENT = "sent"
    STATUS_DELIVERED = "delivered"
    STATUS_READ = "read"
    STATUS_CHOICES = [
        (STATUS_SENT, "Sent"),
        (STATUS_DELIVERED, "Delivered"),
        (STATUS_READ, "Read"),
    ]

    TYPE_TEXT = "text"
    TYPE_IMAGE = "image"
    TYPE_FILE = "file"
    TYPE_SYSTEM = "system"
    TYPE_CHOICES = [
        (TYPE_TEXT, "Text"),
        (TYPE_IMAGE, "Image"),
        (TYPE_FILE, "File"),
        (TYPE_SYSTEM, "System"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name="messages"
    )
    sender = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name="sent_messages"
    )
    # Encrypted payload (Base64-encoded AES-GCM ciphertext)
    ciphertext = models.TextField()
    # AES-GCM initialisation vector (Base64-encoded, 12 bytes)
    iv = models.CharField(max_length=32)
    # Sender ephemeral public key for ECDH (Base64-encoded X25519)
    sender_public_key = models.TextField()

    message_type = models.CharField(
        max_length=10, choices=TYPE_CHOICES, default=TYPE_TEXT
    )
    status = models.CharField(
        max_length=10, choices=STATUS_CHOICES, default=STATUS_SENT
    )
    # Reply threading
    reply_to = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="replies"
    )
    # Soft delete — ciphertext wiped, tombstone kept for threading
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "messages"
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["conversation", "created_at"]),
            models.Index(fields=["sender", "created_at"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"Message({self.id}, conv={self.conversation_id})"


class MessageReceipt(models.Model):
    """Per-user read/delivery receipts for group conversations."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    message = models.ForeignKey(
        Message, on_delete=models.CASCADE, related_name="receipts"
    )
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="receipts"
    )
    delivered_at = models.DateTimeField(null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "message_receipts"
        unique_together = [("message", "user")]
        indexes = [
            models.Index(fields=["message", "user"]),
        ]
