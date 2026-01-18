import os
import hmac
import hashlib
import time
import jwt
import httpx
from typing import Optional
from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.auth import require_admin
from app.jobs import create_job_internal

router = APIRouter(prefix="/integrations/github", tags=["github"])

# -----------------------------------------------------------------------------
# Environment helpers
# -----------------------------------------------------------------------------


def _get_webhook_secret() -> str | None:
    return os.getenv("GITHUB_WEBHOOK_SECRET", "").strip() or None


def _get_app_id() -> str | None:
    return os.getenv("GITHUB_APP_ID", "").strip() or None


def _get_private_key_pem() -> str | None:
    """Get private key from PEM string or file path."""
    # First try direct PEM content
    pem = os.getenv("GITHUB_APP_PRIVATE_KEY_PEM", "").strip()
    if pem:
        # Handle escaped newlines
        return pem.replace("\\n", "\n")

    # Then try file path
    path = os.getenv("GITHUB_APP_PRIVATE_KEY_PATH", "").strip()
    if path and os.path.exists(path):
        with open(path, "r") as f:
            return f.read()

    return None


def _get_installation_id() -> str | None:
    return os.getenv("GITHUB_INSTALLATION_ID", "").strip() or None


def _get_api_base() -> str:
    return os.getenv("GITHUB_API_BASE", "https://api.github.com").strip()


def _is_app_configured() -> bool:
    return bool(_get_app_id() and _get_private_key_pem() and _get_installation_id())


# -----------------------------------------------------------------------------
# Webhook signature verification
# -----------------------------------------------------------------------------


def _verify_webhook_signature(secret: str, payload: bytes, signature: str) -> bool:
    """Verify GitHub webhook signature (X-Hub-Signature-256)."""
    if not signature.startswith("sha256="):
        return False

    expected = "sha256=" + hmac.new(
        secret.encode("utf-8"),
        payload,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, signature)


# -----------------------------------------------------------------------------
# GitHub App Authentication
# -----------------------------------------------------------------------------


def _create_app_jwt(app_id: str, private_key_pem: str) -> str:
    """Create a JWT for GitHub App authentication."""
    now = int(time.time())
    payload = {
        "iat": now - 60,  # Issued 60 seconds ago (clock drift)
        "exp": now + 600,  # Expires in 10 minutes (max allowed)
        "iss": app_id,
    }
    return jwt.encode(payload, private_key_pem, algorithm="RS256")


async def _get_installation_token(installation_id: str) -> str:
    """Get an installation access token from GitHub."""
    app_id = _get_app_id()
    private_key = _get_private_key_pem()

    if not app_id or not private_key:
        raise HTTPException(status_code=500, detail="GitHub App not configured")

    app_jwt = _create_app_jwt(app_id, private_key)
    api_base = _get_api_base()

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            f"{api_base}/app/installations/{installation_id}/access_tokens",
            headers={
                "Authorization": f"Bearer {app_jwt}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )

        if response.status_code != 201:
            raise HTTPException(
                status_code=502,
                detail=f"GitHub API error: {response.status_code}",
            )

        data = response.json()
        return data["token"]


async def _github_api_request(
    method: str,
    path: str,
    installation_id: str | None = None,
    json_body: dict | None = None,
) -> dict:
    """Make an authenticated request to GitHub API."""
    inst_id = installation_id or _get_installation_id()
    if not inst_id:
        raise HTTPException(status_code=500, detail="GitHub installation not configured")

    token = await _get_installation_token(inst_id)
    api_base = _get_api_base()

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.request(
            method=method,
            url=f"{api_base}{path}",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            json=json_body,
        )

        if response.status_code >= 400:
            raise HTTPException(
                status_code=502,
                detail=f"GitHub API error: {response.status_code} - {response.text[:200]}",
            )

        if response.status_code == 204:
            return {}

        return response.json()


# -----------------------------------------------------------------------------
# Webhook Endpoint
# -----------------------------------------------------------------------------


@router.post("/webhook")
async def github_webhook(request: Request):
    """Handle GitHub webhook events."""
    # Check if webhook secret is configured
    secret = _get_webhook_secret()
    if not secret:
        raise HTTPException(status_code=500, detail="GitHub integration not configured")

    # Get raw body for signature verification
    body = await request.body()

    # Verify signature
    signature = request.headers.get("X-Hub-Signature-256", "")
    if not _verify_webhook_signature(secret, body, signature):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse JSON
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Get event type
    event_type = request.headers.get("X-GitHub-Event", "unknown")

    # Handle different event types
    job = None

    if event_type == "pull_request":
        action = payload.get("action", "")
        if action in ("opened", "reopened", "synchronize"):
            pr = payload.get("pull_request", {})
            repo = payload.get("repository", {})
            job = create_job_internal(
                title=f"GH PR {action}: {repo.get('full_name')}#{pr.get('number')} {pr.get('title', '')[:50]}",
                payload={
                    "source": "github",
                    "event_type": event_type,
                    "action": action,
                    "repo_full_name": repo.get("full_name"),
                    "html_url": pr.get("html_url"),
                    "number": pr.get("number"),
                    "title": pr.get("title"),
                    "sender": payload.get("sender", {}).get("login"),
                    "installation_id": payload.get("installation", {}).get("id"),
                },
                source="github",
            )

    elif event_type == "issues":
        action = payload.get("action", "")
        if action in ("opened", "reopened"):
            issue = payload.get("issue", {})
            repo = payload.get("repository", {})
            job = create_job_internal(
                title=f"GH Issue {action}: {repo.get('full_name')}#{issue.get('number')} {issue.get('title', '')[:50]}",
                payload={
                    "source": "github",
                    "event_type": event_type,
                    "action": action,
                    "repo_full_name": repo.get("full_name"),
                    "html_url": issue.get("html_url"),
                    "number": issue.get("number"),
                    "title": issue.get("title"),
                    "sender": payload.get("sender", {}).get("login"),
                    "installation_id": payload.get("installation", {}).get("id"),
                },
                source="github",
            )

    elif event_type == "ping":
        # GitHub sends ping on webhook setup
        return JSONResponse({"ok": True, "event": "ping", "zen": payload.get("zen", "")})

    if job:
        return JSONResponse({"ok": True, "job_id": job["id"]})

    return JSONResponse({"ok": True, "event": event_type, "handled": False})


# -----------------------------------------------------------------------------
# Action Endpoints
# -----------------------------------------------------------------------------


class CommentRequest(BaseModel):
    repo: str  # "org/repo"
    issue_number: int
    body: str


class LabelRequest(BaseModel):
    repo: str  # "org/repo"
    issue_number: int
    labels: list[str]


@router.post("/actions/comment")
async def add_comment(data: CommentRequest, user: dict = Depends(require_admin)):
    """Add a comment to a GitHub issue or PR."""
    if not _is_app_configured():
        raise HTTPException(status_code=500, detail="GitHub App not configured")

    result = await _github_api_request(
        method="POST",
        path=f"/repos/{data.repo}/issues/{data.issue_number}/comments",
        json_body={"body": data.body},
    )

    return {"ok": True, "comment_id": result.get("id")}


@router.post("/actions/label")
async def add_labels(data: LabelRequest, user: dict = Depends(require_admin)):
    """Add labels to a GitHub issue or PR."""
    if not _is_app_configured():
        raise HTTPException(status_code=500, detail="GitHub App not configured")

    result = await _github_api_request(
        method="POST",
        path=f"/repos/{data.repo}/issues/{data.issue_number}/labels",
        json_body={"labels": data.labels},
    )

    return {"ok": True, "labels": [l.get("name") for l in result]}
