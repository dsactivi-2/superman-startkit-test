import os
import time
import hmac
import hashlib
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

router = APIRouter(prefix="/auth", tags=["auth"])
bearer = HTTPBearer(auto_error=False)

_attempts = {}

def _rate_limit(key: str, limit: int = 10, window_seconds: int = 60):
    now = time.time()
    arr = _attempts.get(key, [])
    arr = [t for t in arr if now - t < window_seconds]
    if len(arr) >= limit:
        raise HTTPException(status_code=429, detail="Too many attempts, try later")
    arr.append(now)
    _attempts[key] = arr

def _env(name: str) -> str:
    v = os.getenv(name, "")
    return v.strip()

def _verify_password(plain: str, expected_hash_hex: str) -> bool:
    if not expected_hash_hex:
        return False
    digest = hashlib.sha256(plain.encode("utf-8")).hexdigest()
    return hmac.compare_digest(digest, expected_hash_hex)

def _token_for(email: str, secret: str) -> str:
    ts = str(int(time.time()))
    msg = f"{email}|{ts}".encode("utf-8")
    sig = hmac.new(secret.encode("utf-8"), msg, hashlib.sha256).hexdigest()
    return f"mvp.{ts}.{sig}"

def _token_valid(token: str, email: str, secret: str, max_age_seconds: int = 7 * 24 * 3600) -> bool:
    try:
        prefix, ts, sig = token.split(".", 2)
        if prefix != "mvp":
            return False
        ts_i = int(ts)
        if time.time() - ts_i > max_age_seconds:
            return False
        msg = f"{email}|{ts}".encode("utf-8")
        expected = hmac.new(secret.encode("utf-8"), msg, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, sig)
    except Exception:
        return False

class LoginIn(BaseModel):
    email: str
    password: str

class LoginOut(BaseModel):
    token: str
    user: dict

@router.post("/login", response_model=LoginOut)
def login(payload: LoginIn):
    admin_email = _env("ADMIN_EMAIL")
    admin_hash = _env("ADMIN_PASSWORD_HASH")
    secret = _env("JWT_SECRET") or "dev-secret"

    if not admin_email or not admin_hash:
        raise HTTPException(status_code=500, detail="Admin not configured (ADMIN_EMAIL/ADMIN_PASSWORD_HASH)")

    _rate_limit(payload.email.lower())

    if payload.email.lower() != admin_email.lower():
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not _verify_password(payload.password, admin_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = _token_for(admin_email, secret)
    return {"token": token, "user": {"id": "admin-1", "email": admin_email, "role": "admin"}}

def require_admin(creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> dict:
    if creds is None or not creds.credentials:
        raise HTTPException(status_code=401, detail="Missing token")
    token = creds.credentials

    admin_email = _env("ADMIN_EMAIL")
    secret = _env("JWT_SECRET") or "dev-secret"

    if not _token_valid(token, admin_email, secret):
        raise HTTPException(status_code=401, detail="Invalid token")

    return {"id": "admin-1", "email": admin_email, "role": "admin"}
