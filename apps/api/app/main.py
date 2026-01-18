from fastapi import FastAPI
from fastapi.responses import JSONResponse
from app.auth import router as auth_router
from app.jobs import router as jobs_router
from app.slack import router as slack_router
from app.github_integration import router as github_router

app = FastAPI()
app.include_router(auth_router)
app.include_router(jobs_router)
app.include_router(slack_router)
app.include_router(github_router)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/version")
def version():
    return {"version": "0.1.0"}

@app.exception_handler(Exception)
async def unhandled(_, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "internal", "message": str(exc), "request_id": "todo", "details": {}}},
    )
