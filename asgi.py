"""
SecureChat ASGI Configuration
Supports HTTP (Django) + WebSocket (Django Channels) on a single process.
"""

import os

import django
from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "securechat.settings.base")
django.setup()

# Import routing AFTER setup to avoid AppRegistryNotReady
from securechat.channels.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter(
    {
        # Standard Django HTTP handling
        "http": get_asgi_application(),
        # WebSocket connections secured by host validation + JWT auth
        "websocket": AllowedHostsOriginValidator(
            AuthMiddlewareStack(URLRouter(websocket_urlpatterns))
        ),
    }
)
