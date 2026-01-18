"""
AI Supervisor API - Main Application

Central FastAPI application with all routers and middleware.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.auth import router as auth_router
from app.jobs import router as jobs_router
from app.slack import router as slack_router
from app.github_integration import router as github_router
from app.supervisor import router as supervisor_router
from app.audit import router as audit_router, log_startup
from app.admin import router as admin_router

app = FastAPI(
    title="AI Supervisor API",
    version="0.2.0",
    description="Control Center API for AI Supervisor Hybrid-Ops",
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include all routers
app.include_router(auth_router)
app.include_router(jobs_router)
app.include_router(slack_router)
app.include_router(github_router)
app.include_router(supervisor_router)
app.include_router(audit_router)
app.include_router(admin_router)


@app.on_event("startup")
async def startup_event():
    """Log startup event to audit log."""
    log_startup()


@app.get("/health")
def health():
    """Simple health check endpoint."""
    return {"status": "ok"}


@app.get("/version")
def version():
    """Get API version."""
    return {"version": "0.2.0", "name": "AI Supervisor API"}


@app.exception_handler(Exception)
async def unhandled(_, exc: Exception):
    """Global exception handler."""
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "internal",
                "message": str(exc),
                "request_id": "todo",
                "details": {},
            }
        },
    )
