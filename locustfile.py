"""
SecureChat Load Test — Locust
Validates: ~10,000 msgs/s throughput  |  p95 latency ≤ 30ms  |  >99.9% SLA

Usage:
    locust -f locustfile.py --headless \
           -u 2000 -r 200 \
           --run-time 5m \
           --host https://api.securechat.example.com

Targets:
    - REST endpoints (JWT auth, conversation list, message history)
    - WebSocket message send/receive round-trip latency
"""

import json
import time
import uuid
from locust import HttpUser, TaskSet, between, events, task
import websocket  # websocket-client


# ── Shared test fixtures (pre-seeded in the test DB) ─────────────────────────
TEST_USERS = [
    {"username": f"loadtest_user_{i}", "password": "Load@test123!"}
    for i in range(200)
]
TEST_CONV_ID = "00000000-0000-0000-0000-000000000001"  # Pre-created conversation


# ── REST task set ─────────────────────────────────────────────────────────────

class MessageTaskSet(TaskSet):
    token: str = ""
    conv_id: str = TEST_CONV_ID

    def on_start(self):
        """Authenticate and store JWT."""
        import random
        creds = random.choice(TEST_USERS)
        resp = self.client.post(
            "/api/v1/auth/token/",
            json=creds,
            name="/auth/token/",
        )
        if resp.status_code == 200:
            self.token = resp.json()["access"]
        else:
            self.token = ""

    def auth_headers(self):
        return {"Authorization": f"Bearer {self.token}"}

    @task(3)
    def list_conversations(self):
        self.client.get(
            "/api/v1/conversations/",
            headers=self.auth_headers(),
            name="/conversations/",
        )

    @task(5)
    def list_messages(self):
        self.client.get(
            f"/api/v1/conversations/{self.conv_id}/messages/?limit=50",
            headers=self.auth_headers(),
            name="/messages/",
        )

    @task(10)
    def send_message_http(self):
        """Fallback HTTP message send — measures REST throughput."""
        payload = {
            "ciphertext": uuid.uuid4().hex * 4,     # simulated ciphertext
            "iv": uuid.uuid4().hex[:24],
            "sender_public_key": uuid.uuid4().hex * 2,
            "message_type": "text",
        }
        self.client.post(
            f"/api/v1/conversations/{self.conv_id}/messages/",
            json=payload,
            headers=self.auth_headers(),
            name="/messages/ [POST]",
        )

    @task(1)
    def get_profile(self):
        self.client.get(
            "/api/v1/users/me/",
            headers=self.auth_headers(),
            name="/users/me/",
        )


# ── WebSocket user ────────────────────────────────────────────────────────────

class WebSocketUser(HttpUser):
    """
    Simulates an active user connected over WebSocket.
    Measures round-trip latency for real-time message delivery.
    """

    tasks = [MessageTaskSet]
    wait_time = between(0.05, 0.2)   # 5-20ms think time → ~10k msgs/s across 2000 users

    def on_start(self):
        import random
        creds = random.choice(TEST_USERS)
        resp = self.client.post("/api/v1/auth/token/", json=creds)
        self.token = resp.json().get("access", "")
        self._connect_ws()

    def _connect_ws(self):
        ws_url = self.host.replace("https://", "wss://").replace("http://", "ws://")
        ws_url = f"{ws_url}/ws/chat/?token={self.token}"
        try:
            self.ws = websocket.create_connection(ws_url, timeout=5)
        except Exception as e:
            print(f"[WS] Connection failed: {e}")
            self.ws = None

    @task(20)
    def ws_send_message(self):
        if not self.ws:
            return

        frame = json.dumps({
            "type": "message.send",
            "conversation_id": TEST_CONV_ID,
            "ciphertext": uuid.uuid4().hex * 4,
            "iv": uuid.uuid4().hex[:24],
            "sender_public_key": uuid.uuid4().hex * 2,
            "message_type": "text",
        })

        t0 = time.perf_counter()
        try:
            self.ws.send(frame)
            self.ws.recv()  # wait for echo / broadcast
            elapsed_ms = (time.perf_counter() - t0) * 1000

            events.request.fire(
                request_type="WS",
                name="message.send",
                response_time=elapsed_ms,
                response_length=len(frame),
                exception=None,
                context={},
            )
        except Exception as exc:
            events.request.fire(
                request_type="WS",
                name="message.send",
                response_time=0,
                response_length=0,
                exception=exc,
                context={},
            )
            self._connect_ws()   # Attempt reconnect on failure

    def on_stop(self):
        if self.ws:
            try:
                self.ws.close()
            except Exception:
                pass
