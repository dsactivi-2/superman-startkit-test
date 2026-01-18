from fastapi import FastAPI
from fastapi.responses import JSONResponse

app = FastAPI()

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
