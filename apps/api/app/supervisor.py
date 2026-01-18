"""
Supervisor Controller - Stufe-5 Confirm-before-act

Provides endpoints for planning and executing MCP tool calls
with mandatory 2-step confirmation (also for READ operations).
"""

import os
import re
import uuid
import httpx
from typing import Optional, Any
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from app.auth import require_admin

router = APIRouter(prefix="/supervisor", tags=["supervisor"])

# MCP Configuration
MCP_BASE_URL = os.getenv("MCP_BASE_URL", "http://mcp:3333")
MCP_SHARED_SECRET = os.getenv("MCP_SHARED_SECRET", "").strip()

# Feature flags
REQUIRE_2STEP_FOR_READ = os.getenv("REQUIRE_2STEP_FOR_READ", "true").lower() == "true"

# -----------------------------------------------------------------------------
# Language Detection - Extended Patterns
# -----------------------------------------------------------------------------

LANG_PATTERNS = {
    "de": [
        "liste", "zeige", "zeig", "erstelle", "neu", "genehmige", "ablehnen",
        "bestätige", "hilfe", "was", "wie", "job", "jobs", "alle", "anzeigen",
        "welche", "gibt", "bitte", "danke", "details", "status", "aktualisiere",
    ],
    "bs": [
        "prikaži", "napravi", "odobri", "odbij", "pomoc", "šta", "kako",
        "posao", "poslovi", "lista", "detalji", "kreiraj", "svi", "molim",
    ],
    "en": [
        "list", "show", "create", "approve", "reject", "help", "what", "how",
        "job", "jobs", "all", "please", "details", "status", "update", "new",
    ],
}


def normalize_text(text: str) -> str:
    """Normalize input: lowercase, trim, remove extra punctuation."""
    text = text.lower().strip()
    # Remove trailing punctuation but keep internal ones
    text = re.sub(r'[.!?]+$', '', text)
    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text)
    return text


def detect_language(text: str) -> str:
    """Detect language from user text (DE/BS/EN)."""
    text_normalized = normalize_text(text)
    scores = {"de": 0, "bs": 0, "en": 0}

    for lang, patterns in LANG_PATTERNS.items():
        for pattern in patterns:
            if pattern in text_normalized:
                scores[lang] += 1

    # Default to German if unclear
    max_lang = max(scores, key=scores.get)
    return max_lang if scores[max_lang] > 0 else "de"


# -----------------------------------------------------------------------------
# Intent Parser - Extended Synonyms/Patterns
# -----------------------------------------------------------------------------

# Tool synonym patterns (normalized)
TOOL_PATTERNS = {
    "jobs.list": [
        "liste jobs", "liste alle jobs", "zeige jobs", "zeig jobs",
        "jobs anzeigen", "welche jobs gibt es", "welche jobs",
        "alle jobs", "jobs liste", "zeige alle jobs",
        "list jobs", "show jobs", "show all jobs", "all jobs",
        "prikaži poslove", "lista poslova", "svi poslovi",
    ],
    "jobs.get": [
        "job details", "zeige job", "job anzeigen", "details job",
        "show job", "job info", "get job",
        "detalji posla", "prikaži posao",
    ],
    "jobs.create": [
        "erstelle job", "neuer job", "job erstellen", "neuen job",
        "create job", "new job", "add job",
        "kreiraj posao", "napravi posao", "novi posao",
    ],
    "jobs.approve": [
        "genehmige job", "bestätige job", "job genehmigen", "approve job",
        "odobri posao",
    ],
    "jobs.reject": [
        "ablehnen job", "job ablehnen", "verweigere job", "reject job",
        "odbij posao",
    ],
    "jobs.update": [
        "aktualisiere job", "job aktualisieren", "update job", "edit job",
        "ažuriraj posao",
    ],
}

# Suggestion texts per language
SUGGESTIONS = {
    "de": [
        '"Liste alle Jobs"',
        '"Erstelle Job: <Titel>"',
        '"Genehmige Job <ID>"',
    ],
    "bs": [
        '"Prikaži poslove"',
        '"Kreiraj posao: <Naslov>"',
        '"Odobri posao <ID>"',
    ],
    "en": [
        '"List jobs"',
        '"Create job: <Title>"',
        '"Approve job <ID>"',
    ],
}


def parse_intent(text: str) -> tuple[str, dict, list[str]]:
    """
    Parse user text to determine tool and params.
    Returns (tool_name, params_dict, suggestions).
    suggestions is empty if intent is clear, otherwise contains 3 examples.
    """
    text_normalized = normalize_text(text)
    lang = detect_language(text)

    # Check each tool pattern
    for tool, patterns in TOOL_PATTERNS.items():
        for pattern in patterns:
            if pattern in text_normalized:
                # Found a match, extract params based on tool
                params = {}

                if tool == "jobs.get":
                    # Extract job ID (UUID format)
                    job_id_match = re.search(r'([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})', text, re.IGNORECASE)
                    if job_id_match:
                        params["job_id"] = job_id_match.group(1)
                    else:
                        # Try to find any ID-like pattern
                        id_match = re.search(r'id[:\s]*([a-zA-Z0-9\-]+)', text_normalized)
                        if id_match:
                            params["job_id"] = id_match.group(1)

                elif tool == "jobs.create":
                    # Extract title from quotes or after colon
                    title_match = re.search(r'[\"\']([^\"\']+)[\"\']', text)
                    if not title_match:
                        title_match = re.search(r'(?:job|posao)[:\s]+(.+)', text_normalized)
                    if title_match:
                        title = title_match.group(1).strip()
                        params["title"] = title.title() if len(title) > 0 else "Neuer Job"
                    else:
                        params["title"] = "Neuer Job"

                elif tool in ("jobs.approve", "jobs.reject", "jobs.update"):
                    # Extract job ID
                    job_id_match = re.search(r'([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})', text, re.IGNORECASE)
                    if job_id_match:
                        params["job_id"] = job_id_match.group(1)

                return tool, params, []

    # No match found - return suggestions
    return "", {}, SUGGESTIONS.get(lang, SUGGESTIONS["de"])


# -----------------------------------------------------------------------------
# Response Translations
# -----------------------------------------------------------------------------

TRANSLATIONS = {
    "de": {
        "understood": "Verstanden",
        "plan": "Plan",
        "tools": "Tools",
        "confirm_question": "Soll ich fortfahren?",
        "execute_instruction": "Schreibe: EXECUTE {action}",
        "success": "Erfolgreich ausgeführt",
        "error": "Fehler",
        "unclear": "Ich habe nicht verstanden was du möchtest.",
        "suggestions_prefix": "Versuche z.B.:",
        "type_read": "LESEN",
        "type_write": "SCHREIBEN",
    },
    "bs": {
        "understood": "Razumijem",
        "plan": "Plan",
        "tools": "Alati",
        "confirm_question": "Da li da nastavim?",
        "execute_instruction": "Napiši: EXECUTE {action}",
        "success": "Uspješno izvršeno",
        "error": "Greška",
        "unclear": "Nisam razumio šta želiš.",
        "suggestions_prefix": "Pokušaj npr.:",
        "type_read": "ČITANJE",
        "type_write": "PISANJE",
    },
    "en": {
        "understood": "Understood",
        "plan": "Plan",
        "tools": "Tools",
        "confirm_question": "Should I proceed?",
        "execute_instruction": "Type: EXECUTE {action}",
        "success": "Successfully executed",
        "error": "Error",
        "unclear": "I didn't understand what you want.",
        "suggestions_prefix": "Try e.g.:",
        "type_read": "READ",
        "type_write": "WRITE",
    },
}

# Tool descriptions per language
TOOL_DESCRIPTIONS = {
    "jobs.list": {"de": "Alle Jobs auflisten", "bs": "Prikaži sve poslove", "en": "List all jobs"},
    "jobs.get": {"de": "Job-Details anzeigen", "bs": "Prikaži detalje posla", "en": "Show job details"},
    "jobs.create": {"de": "Neuen Job erstellen", "bs": "Kreiraj novi posao", "en": "Create a new job"},
    "jobs.approve": {"de": "Job genehmigen", "bs": "Odobri posao", "en": "Approve job"},
    "jobs.reject": {"de": "Job ablehnen", "bs": "Odbij posao", "en": "Reject job"},
    "jobs.update": {"de": "Job aktualisieren", "bs": "Ažuriraj posao", "en": "Update job"},
}


def get_tool_info(tool: str, lang: str = "de") -> dict:
    """Get tool metadata with localized description."""
    TOOL_INFO = {
        "jobs.list": {"type": "READ"},
        "jobs.get": {"type": "READ"},
        "jobs.create": {"type": "WRITE"},
        "jobs.approve": {"type": "WRITE"},
        "jobs.reject": {"type": "WRITE"},
        "jobs.update": {"type": "WRITE"},
    }
    info = TOOL_INFO.get(tool, {"type": "UNKNOWN"})
    desc = TOOL_DESCRIPTIONS.get(tool, {}).get(lang, tool)
    info["description"] = desc
    return info


# -----------------------------------------------------------------------------
# Confirm Token Store (in-memory, for MVP)
# -----------------------------------------------------------------------------

_confirm_tokens: dict[str, dict] = {}


def generate_confirm_token(tool: str, params: dict) -> str:
    """Generate a confirm token for 2-step verification."""
    token = str(uuid.uuid4())
    _confirm_tokens[token] = {
        "tool": tool,
        "params": params,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    return token


def validate_confirm_token(token: str, tool: str) -> bool:
    """Validate that a confirm token exists and matches the tool."""
    stored = _confirm_tokens.get(token)
    if not stored:
        return False
    if stored["tool"] != tool:
        return False
    # Token is valid, remove it (one-time use)
    del _confirm_tokens[token]
    return True


# -----------------------------------------------------------------------------
# Models
# -----------------------------------------------------------------------------

class PlanRequest(BaseModel):
    text: str
    language: Optional[str] = None  # DE/BS/EN, auto-detect if not set


class PlanResponse(BaseModel):
    status: str  # "plan", "error", "unclear"
    language: str
    summary: list[str]
    plan: list[str]
    tools: list[str]
    tool_type: str  # READ or WRITE
    tool_type_localized: str  # Localized type name
    confirm_question: str
    confirm_token: Optional[str] = None
    execute_instruction: Optional[str] = None
    parsed_tool: Optional[str] = None
    parsed_params: Optional[dict] = None
    suggestions: Optional[list[str]] = None
    error: Optional[str] = None


class ExecuteRequest(BaseModel):
    execute_command: str  # Must be "EXECUTE <ACTION>"
    confirm_token: str  # Required for all operations (Stufe-5)
    tool: str
    params: dict = {}


class ExecuteResponse(BaseModel):
    status: str  # "ok", "error"
    language: str
    message: str
    result: Optional[dict[str, Any]] = None
    error: Optional[str] = None


# -----------------------------------------------------------------------------
# Helper Functions
# -----------------------------------------------------------------------------

def normalize_result(raw_result: Any) -> dict[str, Any]:
    """
    Normalize MCP result to always return a dict.
    - list → {"items": list}
    - dict → dict as-is
    - scalar → {"value": scalar}
    - None → {}
    """
    if raw_result is None:
        return {}
    if isinstance(raw_result, list):
        return {"items": raw_result}
    if isinstance(raw_result, dict):
        return raw_result
    return {"value": raw_result}


# -----------------------------------------------------------------------------
# MCP Client
# -----------------------------------------------------------------------------

async def call_mcp(
    tool: str,
    params: dict,
    confirm: bool = False,
    confirm_token: str = None,
) -> tuple[int, dict]:
    """Call MCP tool server."""
    headers = {"X-MCP-SECRET": MCP_SHARED_SECRET}
    body = {
        "tool": tool,
        "params": params,
        "confirm": confirm,
    }
    if confirm_token:
        body["confirm_token"] = confirm_token

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(
                f"{MCP_BASE_URL}/run",
                headers=headers,
                json=body,
            )
            return response.status_code, response.json()
        except Exception as e:
            return 500, {"error": str(e)}


# -----------------------------------------------------------------------------
# Endpoints
# -----------------------------------------------------------------------------

@router.post("/plan", response_model=PlanResponse)
async def create_plan(request: PlanRequest, user: dict = Depends(require_admin)):
    """
    Analyze user text and create execution plan.
    Stufe-5: Always requires confirmation, even for READ operations.
    """
    text = request.text.strip()
    lang = request.language or detect_language(text)
    t = TRANSLATIONS.get(lang, TRANSLATIONS["de"])

    # Parse intent
    tool, params, suggestions = parse_intent(text)

    if not tool:
        # Unclear intent - return suggestions
        error_msg = t["unclear"]
        if suggestions:
            error_msg += f"\n\n{t['suggestions_prefix']}\n" + "\n".join(f"- {s}" for s in suggestions)

        return PlanResponse(
            status="unclear",
            language=lang,
            summary=[t["unclear"]],
            plan=[],
            tools=[],
            tool_type="",
            tool_type_localized="",
            confirm_question="",
            suggestions=suggestions,
            error=error_msg,
        )

    tool_info = get_tool_info(tool, lang)
    tool_type = tool_info["type"]
    tool_type_localized = t.get(f"type_{tool_type.lower()}", tool_type)

    # Build summary
    summary = [
        f"{t['understood']}: {text}",
        f"Tool: {tool}",
        f"Type: {tool_type_localized}",
    ]
    if params:
        summary.append(f"Parameters: {params}")

    # Build plan
    plan = [f"1. {tool_info['description']}"]
    if params:
        plan.append(f"2. Parameters: {params}")

    # Stufe-5: Generate confirm token for ALL operations (READ and WRITE)
    confirm_token = generate_confirm_token(tool, params)
    action_name = tool.split(".")[-1].upper()

    return PlanResponse(
        status="plan",
        language=lang,
        summary=summary,
        plan=plan,
        tools=[tool],
        tool_type=tool_type,
        tool_type_localized=tool_type_localized,
        confirm_question=t["confirm_question"],
        confirm_token=confirm_token,
        execute_instruction=t["execute_instruction"].format(action=action_name),
        parsed_tool=tool,
        parsed_params=params,
    )


@router.post("/execute", response_model=ExecuteResponse)
async def execute_plan(request: ExecuteRequest, user: dict = Depends(require_admin)):
    """
    Execute a planned tool call.
    Stufe-5: Requires EXECUTE command and confirm_token for ALL operations.
    """
    lang = detect_language(request.execute_command)
    t = TRANSLATIONS.get(lang, TRANSLATIONS["de"])

    # Validate EXECUTE command
    execute_match = re.match(r"EXECUTE\s+(.+)", request.execute_command.strip(), re.IGNORECASE)
    if not execute_match:
        return ExecuteResponse(
            status="error",
            language=lang,
            message="",
            error=f"Invalid command. {t['execute_instruction'].format(action='ACTION')}",
        )

    tool = request.tool
    params = request.params

    # Stufe-5: Always require and validate confirm_token
    if not request.confirm_token:
        return ExecuteResponse(
            status="error",
            language=lang,
            message="",
            error="confirm_token required (Stufe-5)",
        )

    if not validate_confirm_token(request.confirm_token, tool):
        return ExecuteResponse(
            status="error",
            language=lang,
            message="",
            error="Invalid or expired confirm_token",
        )

    # Execute via MCP
    status_code, mcp_result = await call_mcp(tool, params, confirm=True, confirm_token=request.confirm_token)

    if status_code >= 400 or mcp_result.get("status") == "error":
        return ExecuteResponse(
            status="error",
            language=lang,
            message="",
            error=mcp_result.get("error", "Execution failed"),
        )

    # Normalize result to always be a dict
    raw_result = mcp_result.get("result")
    normalized = normalize_result(raw_result)

    return ExecuteResponse(
        status="ok",
        language=lang,
        message=t["success"],
        result=normalized,
    )


@router.get("/tools")
async def list_available_tools(user: dict = Depends(require_admin)):
    """List available MCP tools."""
    headers = {"X-MCP-SECRET": MCP_SHARED_SECRET}

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.get(f"{MCP_BASE_URL}/tools", headers=headers)
            return response.json()
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
