"""
Audit Log - Event Tracking System

Logs all significant actions for compliance and debugging.
Secrets are automatically redacted from logged data.
"""

import os
import uuid
import re
from datetime import datetime, timezone
from typing import Optional, Literal
from collections import deque
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.auth import require_admin

router = APIRouter(prefix="/audit", tags=["audit"])

# In-memory audit log (deque with max size for MVP)
MAX_AUDIT_EVENTS = 1000
_audit_log: deque = deque(maxlen=MAX_AUDIT_EVENTS)

# Event types
AuditAction = Literal[
    "job.create",
    "job.update",
    "job.status_change",
    "job.approve",
    "job.reject",
    "job.note_add",
    "supervisor.plan",
    "supervisor.execute",
    "auth.login",
    "auth.logout",
    "admin.export",
    "system.startup",
    "system.error",
]

AuditStatus = Literal["ok", "failed", "pending"]

# Secrets patterns to redact
SECRET_PATTERNS = [
    r'"(password|secret|token|api_key|apikey|auth)["\s]*:["\s]*[^"]*"',
    r'(password|secret|token|api_key|apikey)=\S+',
    r'Bearer\s+\S+',
]


# -----------------------------------------------------------------------------
# Models
# -----------------------------------------------------------------------------

class AuditEvent(BaseModel):
    id: str
    timestamp: str
    action: str
    actor: str  # email or "system"
    status: AuditStatus
    job_id: Optional[str] = None
    tool: Optional[str] = None
    details: Optional[dict] = None
    request_id: Optional[str] = None


class AuditStats(BaseModel):
    total_events: int
    events_by_action: dict[str, int]
    events_by_status: dict[str, int]
    oldest_event: Optional[str]
    newest_event: Optional[str]


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _redact_secrets(data: dict | str | None) -> dict | str | None:
    """Redact sensitive data from audit logs."""
    if data is None:
        return None

    if isinstance(data, str):
        result = data
        for pattern in SECRET_PATTERNS:
            result = re.sub(pattern, "[REDACTED]", result, flags=re.IGNORECASE)
        return result

    if isinstance(data, dict):
        redacted = {}
        sensitive_keys = {"password", "secret", "token", "api_key", "apikey", "auth", "key", "credential"}
        for key, value in data.items():
            if any(s in key.lower() for s in sensitive_keys):
                redacted[key] = "[REDACTED]"
            elif isinstance(value, dict):
                redacted[key] = _redact_secrets(value)
            elif isinstance(value, str):
                redacted[key] = _redact_secrets(value)
            else:
                redacted[key] = value
        return redacted

    return data


def log_audit_event(
    action: str,
    actor: str,
    status: AuditStatus = "ok",
    job_id: Optional[str] = None,
    tool: Optional[str] = None,
    details: Optional[dict] = None,
    request_id: Optional[str] = None,
) -> AuditEvent:
    """
    Log an audit event.
    Called from other modules to record actions.
    """
    event = AuditEvent(
        id=str(uuid.uuid4()),
        timestamp=_now_iso(),
        action=action,
        actor=actor,
        status=status,
        job_id=job_id,
        tool=tool,
        details=_redact_secrets(details) if details else None,
        request_id=request_id or str(uuid.uuid4())[:8],
    )
    _audit_log.append(event.model_dump())
    return event


# Log system startup
def log_startup():
    """Log system startup event."""
    log_audit_event(
        action="system.startup",
        actor="system",
        status="ok",
        details={"message": "API server started"},
    )


# -----------------------------------------------------------------------------
# Endpoints
# -----------------------------------------------------------------------------

@router.get("", response_model=list[AuditEvent])
def list_audit_events(
    action: Optional[str] = Query(None, description="Filter by action type"),
    actor: Optional[str] = Query(None, description="Filter by actor email"),
    status: Optional[AuditStatus] = Query(None, description="Filter by status"),
    job_id: Optional[str] = Query(None, description="Filter by job ID"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user: dict = Depends(require_admin),
):
    """List audit events with optional filters."""
    events = list(_audit_log)

    # Apply filters
    if action:
        events = [e for e in events if e["action"] == action]
    if actor:
        events = [e for e in events if e["actor"] == actor]
    if status:
        events = [e for e in events if e["status"] == status]
    if job_id:
        events = [e for e in events if e.get("job_id") == job_id]

    # Sort by timestamp desc (newest first)
    events = sorted(events, key=lambda e: e["timestamp"], reverse=True)

    # Pagination
    events = events[offset:offset + limit]

    return events


@router.get("/stats", response_model=AuditStats)
def get_audit_stats(user: dict = Depends(require_admin)):
    """Get audit log statistics."""
    events = list(_audit_log)

    # Count by action
    by_action: dict[str, int] = {}
    for e in events:
        action = e["action"]
        by_action[action] = by_action.get(action, 0) + 1

    # Count by status
    by_status: dict[str, int] = {}
    for e in events:
        status = e["status"]
        by_status[status] = by_status.get(status, 0) + 1

    # Oldest/newest
    if events:
        sorted_events = sorted(events, key=lambda e: e["timestamp"])
        oldest = sorted_events[0]["timestamp"]
        newest = sorted_events[-1]["timestamp"]
    else:
        oldest = None
        newest = None

    return AuditStats(
        total_events=len(events),
        events_by_action=by_action,
        events_by_status=by_status,
        oldest_event=oldest,
        newest_event=newest,
    )


@router.get("/actions")
def list_audit_actions(user: dict = Depends(require_admin)):
    """List all possible audit action types."""
    return {
        "actions": [
            "job.create",
            "job.update",
            "job.status_change",
            "job.approve",
            "job.reject",
            "job.note_add",
            "supervisor.plan",
            "supervisor.execute",
            "auth.login",
            "auth.logout",
            "admin.export",
            "system.startup",
            "system.error",
        ]
    }
