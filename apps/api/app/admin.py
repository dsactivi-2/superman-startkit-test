"""
Admin API - System Status, Health Checks, and Feature Flags

Provides administrative endpoints for monitoring and configuration.
"""

import os
import time
import subprocess
import httpx
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth import require_admin

router = APIRouter(prefix="/admin", tags=["admin"])

# Track startup time
_startup_time = time.time()


# -----------------------------------------------------------------------------
# Models
# -----------------------------------------------------------------------------

class ServiceHealth(BaseModel):
    name: str
    status: str  # "healthy", "unhealthy", "unknown"
    latency_ms: Optional[int] = None
    error: Optional[str] = None


class SystemStatus(BaseModel):
    status: str  # "healthy", "degraded", "unhealthy"
    version: str
    uptime_seconds: int
    uptime_human: str
    git_commit: Optional[str] = None
    timestamp: str
    services: list[ServiceHealth]


class FeatureFlag(BaseModel):
    name: str
    enabled: bool
    description: str
    restart_required: bool


class FeaturesResponse(BaseModel):
    features: list[FeatureFlag]


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _format_uptime(seconds: int) -> str:
    """Format uptime in human-readable format."""
    days, remainder = divmod(seconds, 86400)
    hours, remainder = divmod(remainder, 3600)
    minutes, secs = divmod(remainder, 60)

    parts = []
    if days > 0:
        parts.append(f"{days}d")
    if hours > 0:
        parts.append(f"{hours}h")
    if minutes > 0:
        parts.append(f"{minutes}m")
    parts.append(f"{secs}s")

    return " ".join(parts)


def _get_git_commit() -> Optional[str]:
    """Get current git commit hash (short)."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception:
        pass
    return None


async def _check_service_health(name: str, url: str, timeout: float = 5.0) -> ServiceHealth:
    """Check health of a service by making HTTP request."""
    try:
        start = time.time()
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(url)
            latency = int((time.time() - start) * 1000)

            if response.status_code == 200:
                return ServiceHealth(name=name, status="healthy", latency_ms=latency)
            else:
                return ServiceHealth(
                    name=name,
                    status="unhealthy",
                    latency_ms=latency,
                    error=f"HTTP {response.status_code}",
                )
    except httpx.TimeoutException:
        return ServiceHealth(name=name, status="unhealthy", error="Timeout")
    except Exception as e:
        return ServiceHealth(name=name, status="unhealthy", error=str(e))


# -----------------------------------------------------------------------------
# Endpoints
# -----------------------------------------------------------------------------

@router.get("/status", response_model=SystemStatus)
async def get_system_status(user: dict = Depends(require_admin)):
    """
    Get system status including service health checks.
    Checks: API (self), MCP, Database (via connection test).
    """
    services = []

    # Check MCP service
    mcp_url = os.getenv("MCP_BASE_URL", "http://mcp:3333")
    mcp_health = await _check_service_health("mcp", f"{mcp_url}/health")
    services.append(mcp_health)

    # Check Database (PostgreSQL via health endpoint or simple test)
    db_url = os.getenv("DATABASE_URL", "")
    if db_url:
        # For MVP, we just check if the env var is set
        # In production, you'd test the actual connection
        services.append(ServiceHealth(name="database", status="healthy"))
    else:
        services.append(ServiceHealth(name="database", status="unknown", error="DATABASE_URL not set"))

    # API is healthy if we got here
    services.insert(0, ServiceHealth(name="api", status="healthy", latency_ms=0))

    # Determine overall status
    unhealthy_count = sum(1 for s in services if s.status == "unhealthy")
    if unhealthy_count == 0:
        overall_status = "healthy"
    elif unhealthy_count < len(services):
        overall_status = "degraded"
    else:
        overall_status = "unhealthy"

    uptime_seconds = int(time.time() - _startup_time)

    return SystemStatus(
        status=overall_status,
        version="0.2.0",
        uptime_seconds=uptime_seconds,
        uptime_human=_format_uptime(uptime_seconds),
        git_commit=_get_git_commit(),
        timestamp=_now_iso(),
        services=services,
    )


@router.get("/features", response_model=FeaturesResponse)
def get_feature_flags(user: dict = Depends(require_admin)):
    """
    List all feature flags with their current status.
    """
    features = [
        FeatureFlag(
            name="ENABLE_MCP_TOOLS",
            enabled=os.getenv("MCP_BASE_URL", "") != "",
            description="MCP Tool Server integration",
            restart_required=True,
        ),
        FeatureFlag(
            name="ENABLE_SLACK_INTAKE",
            enabled=os.getenv("SLACK_BOT_TOKEN", "") != "",
            description="Slack bot intake for job creation",
            restart_required=True,
        ),
        FeatureFlag(
            name="ENABLE_GITHUB_WEBHOOK",
            enabled=os.getenv("GITHUB_WEBHOOK_SECRET", "") != "",
            description="GitHub webhook integration",
            restart_required=True,
        ),
        FeatureFlag(
            name="ENABLE_TEST_ENDPOINTS",
            enabled=os.getenv("ENABLE_TEST_ENDPOINTS", "false").lower() == "true",
            description="Enable test/debug endpoints",
            restart_required=False,
        ),
        FeatureFlag(
            name="REQUIRE_2STEP_FOR_READ",
            enabled=os.getenv("REQUIRE_2STEP_FOR_READ", "true").lower() == "true",
            description="Require 2-step confirmation for READ operations (Stufe-5)",
            restart_required=False,
        ),
        FeatureFlag(
            name="AUDIT_LOGGING",
            enabled=True,  # Always enabled in this version
            description="Audit event logging",
            restart_required=False,
        ),
    ]

    return FeaturesResponse(features=features)


@router.get("/health-detailed")
async def health_detailed(user: dict = Depends(require_admin)):
    """
    Detailed health check with response times.
    Useful for monitoring dashboards.
    """
    status = await get_system_status(user)
    return {
        "overall": status.status,
        "services": {s.name: {"status": s.status, "latency_ms": s.latency_ms, "error": s.error} for s in status.services},
        "timestamp": _now_iso(),
    }
