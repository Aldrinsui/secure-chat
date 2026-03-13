"""
SecureChat REST API Views
All message content in responses is opaque ciphertext — no server-side decryption.
"""

from django.contrib.auth import get_user_model
from django.db.models import Prefetch
from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from securechat.api.models import Conversation, ConversationParticipant, Message
from securechat.api.serializers import (
    ConversationSerializer,
    MessageSerializer,
    UserSerializer,
)
from securechat.api.throttles import MessageSendThrottle

User = get_user_model()


# ───────────────────────────────────────────────── Auth


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def register(request):
    """
    POST /api/auth/register/
    Create account and return JWT pair.
    Body: { username, password, display_name, public_key }
    """
    serializer = UserSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()

    refresh = RefreshToken.for_user(user)
    return Response(
        {
            "user": UserSerializer(user).data,
            "access": str(refresh.access_token),
            "refresh": str(refresh),
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def logout(request):
    """
    POST /api/auth/logout/
    Blacklist the supplied refresh token.
    """
    try:
        token = RefreshToken(request.data["refresh"])
        token.blacklist()
    except Exception:
        pass
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["PUT"])
@permission_classes([permissions.IsAuthenticated])
def update_public_key(request):
    """
    PUT /api/auth/public-key/
    Rotate the user's X25519 public key for new key exchanges.
    """
    request.user.public_key = request.data.get("public_key", "")
    request.user.save(update_fields=["public_key"])
    return Response({"public_key": request.user.public_key})


# ───────────────────────────────────────────────── Users


class UserDetailView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /api/users/<id>/  — fetch profile or update own profile."""

    serializer_class = UserSerializer
    queryset = User.objects.all()

    def get_object(self):
        pk = self.kwargs.get("pk")
        if pk == "me":
            return self.request.user
        return super().get_object()

    def update(self, request, *args, **kwargs):
        if self.kwargs.get("pk") != "me" and str(request.user.id) != self.kwargs.get("pk"):
            return Response(status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)


@api_view(["GET"])
def user_search(request):
    """GET /api/users/search/?q=<term>"""
    q = request.query_params.get("q", "").strip()
    if len(q) < 2:
        return Response({"results": []})

    users = (
        User.objects.filter(username__icontains=q)
        .exclude(id=request.user.id)
        .values("id", "username", "display_name", "avatar_url", "is_online", "public_key")[:20]
    )
    return Response({"results": list(users)})


# ───────────────────────────────────────────────── Conversations


class ConversationListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/conversations/       — list user's conversations (newest first)
    POST /api/conversations/       — create direct or group conversation
    """

    serializer_class = ConversationSerializer

    def get_queryset(self):
        return (
            Conversation.objects.filter(participants=self.request.user)
            .prefetch_related(
                Prefetch(
                    "participant_set",
                    queryset=ConversationParticipant.objects.select_related("user"),
                )
            )
            .order_by("-updated_at")
        )

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class ConversationDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/conversations/<id>/"""

    serializer_class = ConversationSerializer

    def get_queryset(self):
        return Conversation.objects.filter(participants=self.request.user)


# ───────────────────────────────────────────────── Messages


class MessageListView(generics.ListAPIView):
    """
    GET /api/conversations/<conv_id>/messages/
    Cursor-paginated, newest-first, for efficient infinite scroll.
    """

    serializer_class = MessageSerializer

    def get_queryset(self):
        conv_id = self.kwargs["conv_id"]
        # Verify participation
        if not Conversation.objects.filter(
            id=conv_id, participants=self.request.user
        ).exists():
            return Message.objects.none()

        return (
            Message.objects.filter(conversation_id=conv_id)
            .select_related("sender")
            .order_by("-created_at")
        )


class MessageCreateView(generics.CreateAPIView):
    """
    POST /api/conversations/<conv_id>/messages/
    Fallback HTTP endpoint for offline-synced messages.
    WebSocket is the primary path for real-time delivery.
    """

    serializer_class = MessageSerializer
    throttle_classes = [MessageSendThrottle]

    def perform_create(self, serializer):
        conv_id = self.kwargs["conv_id"]
        if not Conversation.objects.filter(
            id=conv_id, participants=self.request.user
        ).exists():
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Not a participant of this conversation.")

        serializer.save(sender=self.request.user, conversation_id=conv_id)


@api_view(["DELETE"])
def delete_message(request, conv_id, msg_id):
    """
    DELETE /api/conversations/<conv_id>/messages/<msg_id>/
    Soft-delete: wipes ciphertext, keeps tombstone for threading.
    """
    try:
        msg = Message.objects.get(
            id=msg_id, conversation_id=conv_id, sender=request.user
        )
    except Message.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    from django.utils import timezone

    msg.is_deleted = True
    msg.deleted_at = timezone.now()
    msg.ciphertext = ""  # Wipe encrypted payload
    msg.iv = ""
    msg.sender_public_key = ""
    msg.save(update_fields=["is_deleted", "deleted_at", "ciphertext", "iv", "sender_public_key"])

    return Response(status=status.HTTP_204_NO_CONTENT)
