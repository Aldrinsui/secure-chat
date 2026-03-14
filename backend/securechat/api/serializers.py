from rest_framework import serializers
from django.contrib.auth import get_user_model
from securechat.api.models import Conversation, ConversationParticipant, Message

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'password', 'display_name',
            'public_key', 'avatar_url', 'is_online', 'last_seen'
        ]

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class ConversationParticipantSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = ConversationParticipant
        fields = ['user', 'is_admin', 'joined_at', 'last_read_at']


class ConversationSerializer(serializers.ModelSerializer):
    participants = ConversationParticipantSerializer(
        source='participant_set', many=True, read_only=True
    )
    participant_ids = serializers.ListField(
        child=serializers.UUIDField(), write_only=True, required=False
    )

    class Meta:
        model = Conversation
        fields = [
            'id', 'conversation_type', 'name',
            'participants', 'participant_ids',
            'created_at', 'updated_at'
        ]

    def create(self, validated_data):
        participant_ids = validated_data.pop('participant_ids', [])
        conversation = Conversation.objects.create(**validated_data)
        request = self.context.get('request')
        if request:
            ConversationParticipant.objects.create(
                conversation=conversation,
                user=request.user,
                is_admin=True
            )
        for uid in participant_ids:
            try:
                user = User.objects.get(id=uid)
                ConversationParticipant.objects.get_or_create(
                    conversation=conversation, user=user
                )
            except User.DoesNotExist:
                pass
        return conversation


class MessageSerializer(serializers.ModelSerializer):
    sender = UserSerializer(read_only=True)

    class Meta:
        model = Message
        fields = [
            'id', 'conversation', 'sender', 'ciphertext', 'iv',
            'sender_public_key', 'message_type', 'status',
            'reply_to', 'is_deleted', 'created_at', 'updated_at'
        ]
        read_only_fields = ['sender', 'conversation', 'status']