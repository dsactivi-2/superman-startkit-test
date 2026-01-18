"""
Jobs API - Full CRUD + Status Control + Notes + Export

Provides endpoints for managing jobs with admin-level control.
"""

import os
import uuid
from datetime import datetime, timezone
from typing import Optional, Literal
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.auth import require_admin

router = APIRouter(prefix="/jobs", tags=["jobs"])

# In-memory job store
_jobs: dict[str, dict] = {}

# In-memory notes store (job_id -> list of notes)
_job_notes: dict[str, list[dict]] = {}

JobStatus = Literal[
    "queued",
    "processing",
    "needs_approval",
    "approved",
    "rejected",
    "failed",
    "completed",
    "done",
]


# -----------------------------------------------------------------------------
# Models
# -----------------------------------------------------------------------------

class JobCreate(BaseModel):
    title: str
    payload: Optional[dict] = None


class JobUpdate(BaseModel):
    title: Optional[str] = None
    payload: Optional[dict] = None


class JobStatusUpdate(BaseModel):
    status: JobStatus


class NoteCreate(BaseModel):
    text: str


class NoteOut(BaseModel):
    id: str
    text: str
    author: str
    created_at: str


class JobOut(BaseModel):
    id: str
    title: str
    status: JobStatus
    created_at: str
    updated_at: str
    payload: Optional[dict] = None
    result: Optional[dict] = None
    source: Optional[str] = None
    notes_count: Optional[int] = 0


class JobDetailOut(JobOut):
    notes: Optional[list[NoteOut]] = []


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_job_internal(title: str, payload: Optional[dict] = None, source: str = "api") -> dict:
    """Create a job programmatically (for internal use, e.g., Slack intake)."""
    job_id = str(uuid.uuid4())
    now = _now_iso()
    job = {
        "id": job_id,
        "title": title,
        "status": "queued",
        "created_at": now,
        "updated_at": now,
        "payload": payload,
        "result": None,
        "source": source,
    }
    _jobs[job_id] = job
    _job_notes[job_id] = []
    return job


def _get_job_or_404(job_id: str) -> dict:
    """Get job by ID or raise 404."""
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


def _enrich_job(job: dict) -> dict:
    """Add notes_count to job."""
    job_copy = job.copy()
    job_copy["notes_count"] = len(_job_notes.get(job["id"], []))
    return job_copy


def _test_endpoints_enabled() -> bool:
    return os.getenv("ENABLE_TEST_ENDPOINTS", "false").lower() == "true"


# -----------------------------------------------------------------------------
# Endpoints: List, Create, Get
# -----------------------------------------------------------------------------

@router.get("", response_model=list[JobOut])
def list_jobs(
    status: Optional[JobStatus] = Query(None, description="Filter by status"),
    search: Optional[str] = Query(None, description="Search in title"),
    sort: Optional[str] = Query("created_at", description="Sort field"),
    order: Optional[str] = Query("desc", description="Sort order: asc/desc"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    user: dict = Depends(require_admin),
):
    """List jobs with optional filters, search, and pagination."""
    jobs = list(_jobs.values())

    # Filter by status
    if status:
        jobs = [j for j in jobs if j["status"] == status]

    # Search in title
    if search:
        search_lower = search.lower()
        jobs = [j for j in jobs if search_lower in j["title"].lower()]

    # Sort
    reverse = order.lower() == "desc"
    if sort in ("created_at", "updated_at", "title", "status"):
        jobs = sorted(jobs, key=lambda j: j.get(sort, ""), reverse=reverse)
    else:
        jobs = sorted(jobs, key=lambda j: j["created_at"], reverse=True)

    # Pagination
    jobs = jobs[offset:offset + limit]

    # Enrich with notes_count
    return [_enrich_job(j) for j in jobs]


@router.post("", response_model=JobOut, status_code=201)
def create_job(data: JobCreate, user: dict = Depends(require_admin)):
    """Create a new job with status 'queued'."""
    job = create_job_internal(data.title, data.payload, source="api")
    return _enrich_job(job)


@router.get("/export")
def export_jobs(
    format: str = Query("json", description="Export format: json"),
    user: dict = Depends(require_admin),
):
    """Export all jobs as JSON (with notes)."""
    jobs_with_notes = []
    for job in _jobs.values():
        job_data = job.copy()
        job_data["notes"] = _job_notes.get(job["id"], [])
        jobs_with_notes.append(job_data)

    # Sort by created_at desc
    jobs_with_notes.sort(key=lambda j: j["created_at"], reverse=True)

    return JSONResponse(
        content={"jobs": jobs_with_notes, "total": len(jobs_with_notes), "exported_at": _now_iso()},
        media_type="application/json",
    )


@router.get("/{job_id}", response_model=JobDetailOut)
def get_job(job_id: str, user: dict = Depends(require_admin)):
    """Get job by ID with notes."""
    job = _get_job_or_404(job_id)
    job_data = _enrich_job(job)
    job_data["notes"] = _job_notes.get(job_id, [])
    return job_data


# -----------------------------------------------------------------------------
# Endpoints: Update (PATCH)
# -----------------------------------------------------------------------------

@router.patch("/{job_id}", response_model=JobOut)
def update_job(job_id: str, data: JobUpdate, user: dict = Depends(require_admin)):
    """Update job title and/or payload."""
    job = _get_job_or_404(job_id)

    if data.title is not None:
        job["title"] = data.title
    if data.payload is not None:
        job["payload"] = data.payload

    job["updated_at"] = _now_iso()
    return _enrich_job(job)


# -----------------------------------------------------------------------------
# Endpoints: Status Control
# -----------------------------------------------------------------------------

@router.post("/{job_id}/set-status", response_model=JobOut)
def set_job_status(job_id: str, data: JobStatusUpdate, user: dict = Depends(require_admin)):
    """Set job status (admin control - any status allowed)."""
    job = _get_job_or_404(job_id)
    job["status"] = data.status
    job["updated_at"] = _now_iso()
    return _enrich_job(job)


@router.post("/{job_id}/approve", response_model=JobOut)
def approve_job(job_id: str, user: dict = Depends(require_admin)):
    """Approve a job (set status to 'approved')."""
    job = _get_job_or_404(job_id)
    if job["status"] != "needs_approval":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot approve job with status '{job['status']}'. Must be 'needs_approval'.",
        )
    job["status"] = "approved"
    job["updated_at"] = _now_iso()
    return _enrich_job(job)


@router.post("/{job_id}/reject", response_model=JobOut)
def reject_job(job_id: str, user: dict = Depends(require_admin)):
    """Reject a job (set status to 'rejected')."""
    job = _get_job_or_404(job_id)
    if job["status"] != "needs_approval":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot reject job with status '{job['status']}'. Must be 'needs_approval'.",
        )
    job["status"] = "rejected"
    job["updated_at"] = _now_iso()
    return _enrich_job(job)


@router.post("/{job_id}/set-needs-approval", response_model=JobOut)
def set_needs_approval(job_id: str, user: dict = Depends(require_admin)):
    """[TEST] Set job status to 'needs_approval' for testing approve/reject."""
    if not _test_endpoints_enabled():
        raise HTTPException(status_code=404, detail="Not found")
    job = _get_job_or_404(job_id)
    job["status"] = "needs_approval"
    job["updated_at"] = _now_iso()
    return _enrich_job(job)


# -----------------------------------------------------------------------------
# Endpoints: Notes
# -----------------------------------------------------------------------------

@router.get("/{job_id}/notes", response_model=list[NoteOut])
def list_notes(job_id: str, user: dict = Depends(require_admin)):
    """List all notes for a job."""
    _get_job_or_404(job_id)  # Verify job exists
    return _job_notes.get(job_id, [])


@router.post("/{job_id}/note", response_model=NoteOut, status_code=201)
def add_note(job_id: str, data: NoteCreate, user: dict = Depends(require_admin)):
    """Add a note to a job."""
    _get_job_or_404(job_id)  # Verify job exists

    note = {
        "id": str(uuid.uuid4()),
        "text": data.text,
        "author": user.get("email", "unknown"),
        "created_at": _now_iso(),
    }

    if job_id not in _job_notes:
        _job_notes[job_id] = []
    _job_notes[job_id].append(note)

    return note
