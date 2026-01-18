from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.auth import router as auth_router
from app.jobs import router as jobs_router
from app.slack import router as slack_router
from app.github_integration import router as github_router
from app.supervisor import router as supervisor_router

app = FastAPI(title="AI Supervisor API", version="0.2.0")

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(jobs_router)
app.include_router(slack_router)
app.include_router(github_router)
app.include_router(supervisor_router)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/version")
def version():
    return {"version": "0.2.0"}

@app.exception_handler(Exception)
async def unhandled(_, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "internal", "message": str(exc), "request_id": "todo", "details": {}}},
    )
