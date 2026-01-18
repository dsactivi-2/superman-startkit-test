import uuid
from datetime import datetime, timezone
from typing import Optional, Literal
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from app.auth import require_admin

router = APIRouter(prefix="/jobs", tags=["jobs"])

# In-memory job store
_jobs: dict[str, dict] = {}

JobStatus = Literal[
    "queued",
    "processing",
    "needs_approval",
    "approved",
    "rejected",
    "failed",
    "completed",
]


class JobCreate(BaseModel):
    title: str
    payload: Optional[dict] = None


class JobOut(BaseModel):
    id: str
    title: str
    status: JobStatus
    created_at: str
    updated_at: str
    payload: Optional[dict] = None
    result: Optional[dict] = None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("", response_model=list[JobOut])
def list_jobs(user: dict = Depends(require_admin)):
    """List all jobs, newest first."""
    jobs = sorted(_jobs.values(), key=lambda j: j["created_at"], reverse=True)
    return jobs


@router.post("", response_model=JobOut, status_code=201)
def create_job(data: JobCreate, user: dict = Depends(require_admin)):
    """Create a new job with status 'queued'."""
    job_id = str(uuid.uuid4())
    now = _now_iso()
    job = {
        "id": job_id,
        "title": data.title,
        "status": "queued",
        "created_at": now,
        "updated_at": now,
        "payload": data.payload,
        "result": None,
    }
    _jobs[job_id] = job
    return job


@router.get("/{job_id}", response_model=JobOut)
def get_job(job_id: str, user: dict = Depends(require_admin)):
    """Get job by ID."""
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/{job_id}/approve", response_model=JobOut)
def approve_job(job_id: str, user: dict = Depends(require_admin)):
    """Approve a job (set status to 'approved')."""
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] != "needs_approval":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot approve job with status '{job['status']}'. Must be 'needs_approval'.",
        )
    job["status"] = "approved"
    job["updated_at"] = _now_iso()
    return job


@router.post("/{job_id}/reject", response_model=JobOut)
def reject_job(job_id: str, user: dict = Depends(require_admin)):
    """Reject a job (set status to 'rejected')."""
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] != "needs_approval":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot reject job with status '{job['status']}'. Must be 'needs_approval'.",
        )
    job["status"] = "rejected"
    job["updated_at"] = _now_iso()
    return job
