"""
MCP Tool Server for AI Supervisor.

Provides tools that interact with the Supervisor API.
WRITE tools require a 2-step confirm flow for safety.
"""

import os
import hmac
import uuid
import time
import httpx
from typing import Any, Optional, Union
from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel

app = FastAPI(title="MCP Tool Server", version="1.0.0")

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------

API_BASE_URL = os.getenv("API_BASE_URL", "http://api:8000")
MCP_SHARED_SECRET = os.getenv("MCP_SHARED_SECRET", "").strip()
ADMIN_TOKEN = os.getenv("MCP_ADMIN_TOKEN", "").strip()  # Token for API auth

# Confirm tokens storage (in-memory, expires after 5 minutes)
_confirm_tokens: dict[str, dict] = {}
CONFIRM_TOKEN_TTL = 300  # 5 minutes


# -----------------------------------------------------------------------------
# Auth
# -----------------------------------------------------------------------------


def verify_mcp_secret(request: Request):
    """Verify X-MCP-SECRET header."""
    if not MCP_SHARED_SECRET:
        raise HTTPException(status_code=500, detail="MCP_SHARED_SECRET not configured")

    secret = request.headers.get("X-MCP-SECRET", "")
    if not hmac.compare_digest(secret, MCP_SHARED_SECRET):
        raise HTTPException(status_code=401, detail="Invalid MCP secret")


# -----------------------------------------------------------------------------
# Confirm Token Management
# -----------------------------------------------------------------------------


def _cleanup_expired_tokens():
    """Remove expired confirm tokens."""
    now = time.time()
    expired = [k for k, v in _confirm_tokens.items() if now - v["created_at"] > CONFIRM_TOKEN_TTL]
    for k in expired:
        del _confirm_tokens[k]


def create_confirm_token(tool: str, params: dict, summary: str) -> str:
    """Create a confirm token for a WRITE operation."""
    _cleanup_expired_tokens()
    token = str(uuid.uuid4())
    _confirm_tokens[token] = {
        "tool": tool,
        "params": params,
        "summary": summary,
        "created_at": time.time(),
    }
    return token


def validate_confirm_token(token: str, tool: str) -> dict | None:
    """Validate and consume a confirm token."""
    _cleanup_expired_tokens()
    data = _confirm_tokens.get(token)
    if not data:
        return None
    if data["tool"] != tool:
        return None
    # Consume token (one-time use)
    del _confirm_tokens[token]
    return data


# -----------------------------------------------------------------------------
# API Client
# -----------------------------------------------------------------------------


async def api_request(
    method: str,
    path: str,
    json_body: dict | None = None,
    timeout: float = 10.0,
) -> tuple[int, dict]:
    """Make a request to the Supervisor API."""
    headers = {}
    if ADMIN_TOKEN:
        headers["Authorization"] = f"Bearer {ADMIN_TOKEN}"

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.request(
            method=method,
            url=f"{API_BASE_URL}{path}",
            headers=headers,
            json=json_body,
        )
        try:
            data = response.json()
        except Exception:
            data = {"raw": response.text[:500]}
        return response.status_code, data


# -----------------------------------------------------------------------------
# Tool Definitions
# -----------------------------------------------------------------------------

TOOLS = {
    "jobs.list": {
        "description": "List all jobs (newest first)",
        "type": "READ",
        "params": [],
    },
    "jobs.get": {
        "description": "Get job details by ID",
        "type": "READ",
        "params": ["job_id"],
    },
    "jobs.create": {
        "description": "Create a new job",
        "type": "WRITE",
        "params": ["title", "payload"],
    },
    "jobs.set_needs_approval": {
        "description": "Set job status to needs_approval (test only)",
        "type": "TEST",
        "params": ["job_id"],
    },
    "jobs.approve": {
        "description": "Approve a job (changes status to approved)",
        "type": "WRITE",
        "params": ["job_id"],
    },
    "jobs.reject": {
        "description": "Reject a job (changes status to rejected)",
        "type": "WRITE",
        "params": ["job_id"],
    },
    "slack.simulate_mention": {
        "description": "Simulate a Slack mention event (local testing)",
        "type": "TEST",
        "params": ["text", "user", "channel"],
    },
}


# -----------------------------------------------------------------------------
# Tool Execution
# -----------------------------------------------------------------------------


async def execute_tool(tool: str, params: dict) -> tuple[int, dict]:
    """Execute a tool and return (status_code, result)."""
    if tool == "jobs.list":
        return await api_request("GET", "/jobs")

    elif tool == "jobs.get":
        job_id = params.get("job_id")
        if not job_id:
            return 400, {"error": "job_id required"}
        return await api_request("GET", f"/jobs/{job_id}")

    elif tool == "jobs.create":
        title = params.get("title", "Untitled Job")
        payload = params.get("payload", {})
        return await api_request("POST", "/jobs", {"title": title, "payload": payload})

    elif tool == "jobs.set_needs_approval":
        job_id = params.get("job_id")
        if not job_id:
            return 400, {"error": "job_id required"}
        return await api_request("POST", f"/jobs/{job_id}/set-needs-approval")

    elif tool == "jobs.approve":
        job_id = params.get("job_id")
        if not job_id:
            return 400, {"error": "job_id required"}
        return await api_request("POST", f"/jobs/{job_id}/approve")

    elif tool == "jobs.reject":
        job_id = params.get("job_id")
        if not job_id:
            return 400, {"error": "job_id required"}
        return await api_request("POST", f"/jobs/{job_id}/reject")

    elif tool == "slack.simulate_mention":
        text = params.get("text", "Test mention")
        user = params.get("user", "U_TEST")
        channel = params.get("channel", "C_TEST")
        event_payload = {
            "type": "event_callback",
            "event_id": f"test-{uuid.uuid4()}",
            "event": {
                "type": "app_mention",
                "user": user,
                "channel": channel,
                "text": text,
                "ts": str(time.time()),
            },
        }
        # Note: This will fail if SLACK_SIGNING_SECRET is set (no signature)
        return await api_request("POST", "/integrations/slack/events", event_payload)

    else:
        return 404, {"error": f"Unknown tool: {tool}"}


# -----------------------------------------------------------------------------
# Endpoints
# -----------------------------------------------------------------------------


@app.get("/health")
async def health():
    return {"status": "ok", "service": "mcp"}


@app.get("/tools")
async def list_tools(_: None = Depends(verify_mcp_secret)):
    """List available tools."""
    return {"tools": TOOLS}


class ToolRequest(BaseModel):
    tool: str
    params: dict = {}
    confirm: bool = False
    confirm_token: Optional[str] = None


class ToolResponse(BaseModel):
    status: str  # "ok", "plan", "error"
    tool: str
    result: Optional[Any] = None  # Can be dict, list, or None
    error: Optional[str] = None
    # For WRITE tools requiring confirmation
    require_confirm: Optional[bool] = None
    confirm_token: Optional[str] = None
    plan_summary: Optional[str] = None


@app.post("/run", response_model=ToolResponse)
async def run_tool(request: ToolRequest, _: None = Depends(verify_mcp_secret)):
    """
    Run a tool.

    READ tools execute immediately.
    WRITE/TEST tools require 2-step confirmation:
      1. First call returns a plan with confirm_token
      2. Second call with confirm=true and confirm_token executes
    """
    tool = request.tool
    params = request.params

    # Check tool exists
    tool_def = TOOLS.get(tool)
    if not tool_def:
        return ToolResponse(
            status="error",
            tool=tool,
            error=f"Unknown tool: {tool}",
        )

    tool_type = tool_def["type"]

    # READ tools execute immediately
    if tool_type == "READ":
        status_code, result = await execute_tool(tool, params)
        if status_code >= 400:
            return ToolResponse(
                status="error",
                tool=tool,
                error=result.get("detail") or result.get("error") or str(result),
            )
        return ToolResponse(
            status="ok",
            tool=tool,
            result=result,
        )

    # WRITE/TEST tools require confirmation
    if request.confirm and request.confirm_token:
        # Step 2: Execute with confirmation
        token_data = validate_confirm_token(request.confirm_token, tool)
        if not token_data:
            return ToolResponse(
                status="error",
                tool=tool,
                error="Invalid or expired confirm_token",
            )

        # Execute the tool
        status_code, result = await execute_tool(tool, token_data["params"])
        if status_code >= 400:
            return ToolResponse(
                status="error",
                tool=tool,
                error=result.get("detail") or result.get("error") or str(result),
            )
        return ToolResponse(
            status="ok",
            tool=tool,
            result=result,
        )

    else:
        # Step 1: Return plan for confirmation
        summary = _generate_plan_summary(tool, params)
        confirm_token = create_confirm_token(tool, params, summary)

        return ToolResponse(
            status="plan",
            tool=tool,
            require_confirm=True,
            confirm_token=confirm_token,
            plan_summary=summary,
        )


def _generate_plan_summary(tool: str, params: dict) -> str:
    """Generate a human-readable summary of what the tool will do."""
    if tool == "jobs.create":
        return f"Create job: '{params.get('title', 'Untitled')}'"
    elif tool == "jobs.approve":
        return f"Approve job: {params.get('job_id')}"
    elif tool == "jobs.reject":
        return f"Reject job: {params.get('job_id')}"
    elif tool == "jobs.set_needs_approval":
        return f"Set job to needs_approval: {params.get('job_id')}"
    elif tool == "slack.simulate_mention":
        return f"Simulate Slack mention: '{params.get('text', '')}'"
    else:
        return f"Execute {tool} with params: {params}"


# -----------------------------------------------------------------------------
# SSE Endpoint (for streaming responses, optional)
# -----------------------------------------------------------------------------

# Note: Basic SSE implementation for future use
# OpenWebUI may prefer HTTP JSON or SSE depending on configuration

@app.get("/sse/health")
async def sse_health():
    """SSE health check."""
    from sse_starlette.sse import EventSourceResponse

    async def event_generator():
        yield {"event": "health", "data": '{"status": "ok"}'}

    return EventSourceResponse(event_generator())
