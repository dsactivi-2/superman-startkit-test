from fastapi import FastAPI
from fastapi.responses import JSONResponse
from app.auth import router as auth_router

app = FastAPI()
app.include_router(auth_router)

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
