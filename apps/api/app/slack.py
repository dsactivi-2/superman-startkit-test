import os
import hmac
import hashlib
import time
import httpx
from typing import Any
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse

from app.jobs import create_job_internal

router = APIRouter(prefix="/integrations/slack", tags=["slack"])

# Cache processed event IDs to prevent duplicates (simple in-memory)
_processed_events: set[str] = set()
MAX_PROCESSED_EVENTS = 1000


def _get_signing_secret() -> str | None:
    return os.getenv("SLACK_SIGNING_SECRET", "").strip() or None


def _get_bot_token() -> str | None:
    return os.getenv("SLACK_BOT_TOKEN", "").strip() or None


def _verify_slack_signature(
    signing_secret: str,
    timestamp: str,
    body: bytes,
    signature: str,
) -> bool:
    """Verify Slack request signature."""
    # Replay protection: reject timestamps older than 5 minutes
    try:
        ts = int(timestamp)
        if abs(time.time() - ts) > 300:
            return False
    except (ValueError, TypeError):
        return False

    # Compute expected signature
    sig_basestring = f"v0:{timestamp}:{body.decode('utf-8')}"
    computed = "v0=" + hmac.new(
        signing_secret.encode("utf-8"),
        sig_basestring.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(computed, signature)


async def _post_slack_message(channel: str, text: str, thread_ts: str | None = None):
    """Post a message to Slack (fire and forget)."""
    bot_token = _get_bot_token()
    if not bot_token:
        return

    payload: dict[str, Any] = {
        "channel": channel,
        "text": text,
    }
    if thread_ts:
        payload["thread_ts"] = thread_ts

    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                "https://slack.com/api/chat.postMessage",
                headers={"Authorization": f"Bearer {bot_token}"},
                json=payload,
                timeout=5.0,
            )
    except Exception:
        # Fire and forget - don't fail the request
        pass


@router.post("/events")
async def slack_events(request: Request):
    """Handle Slack Events API."""
    signing_secret = _get_signing_secret()

    # Get raw body for signature verification
    body = await request.body()

    # Verify signature if signing secret is configured
    if signing_secret:
        timestamp = request.headers.get("X-Slack-Request-Timestamp", "")
        signature = request.headers.get("X-Slack-Signature", "")

        if not _verify_slack_signature(signing_secret, timestamp, body, signature):
            raise HTTPException(status_code=401, detail="Invalid Slack signature")
    else:
        # In production, this should be an error
        # For local dev without secret, we allow but warn
        pass

    # Parse JSON body
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Handle URL verification challenge
    if data.get("type") == "url_verification":
        return {"challenge": data.get("challenge", "")}

    # Handle event callbacks
    if data.get("type") == "event_callback":
        event = data.get("event", {})
        event_id = data.get("event_id", "")

        # Deduplicate events
        if event_id in _processed_events:
            return JSONResponse({"ok": True, "duplicate": True})

        # Track processed event
        _processed_events.add(event_id)
        if len(_processed_events) > MAX_PROCESSED_EVENTS:
            # Simple cleanup: remove oldest half
            to_remove = list(_processed_events)[: MAX_PROCESSED_EVENTS // 2]
            for e in to_remove:
                _processed_events.discard(e)

        event_type = event.get("type", "")

        # Handle app_mention and direct messages
        if event_type in ("app_mention", "message"):
            # Skip bot messages to prevent loops
            if event.get("bot_id") or event.get("subtype") == "bot_message":
                return JSONResponse({"ok": True, "skipped": "bot_message"})

            text = event.get("text", "").strip()
            user = event.get("user", "unknown")
            channel = event.get("channel", "")
            thread_ts = event.get("thread_ts") or event.get("ts", "")

            # Create job
            job = create_job_internal(
                title=f"Slack: {text[:100]}" if text else "Slack Job",
                payload={
                    "source": "slack",
                    "event_type": event_type,
                    "user": user,
                    "channel": channel,
                    "thread_ts": thread_ts,
                    "text": text,
                    "event_id": event_id,
                },
                source="slack",
            )

            # Reply in Slack (async, fire and forget)
            await _post_slack_message(
                channel=channel,
                text=f"Job created: `{job['id']}`\nStatus: `{job['status']}`",
                thread_ts=thread_ts,
            )

            return JSONResponse({"ok": True, "job_id": job["id"]})

    # Default: acknowledge
    return JSONResponse({"ok": True})
