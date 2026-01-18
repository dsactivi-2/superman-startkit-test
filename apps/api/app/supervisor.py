"""
Supervisor Controller - Stufe-5 Confirm-before-act

Provides endpoints for planning and executing MCP tool calls
with mandatory 2-step confirmation.
"""

import os
import re
import httpx
from typing import Optional, Literal
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from app.auth import require_admin

router = APIRouter(prefix="/supervisor", tags=["supervisor"])

# MCP Configuration
MCP_BASE_URL = os.getenv("MCP_BASE_URL", "http://mcp:3333")
MCP_SHARED_SECRET = os.getenv("MCP_SHARED_SECRET", "").strip()

# Language detection patterns
LANG_PATTERNS = {
    "de": ["liste", "erstelle", "zeige", "hilfe", "was", "wie", "job", "jobs"],
    "bs": ["prikaži", "napravi", "pomoc", "šta", "kako", "posao", "poslovi"],
    "en": ["list", "create", "show", "help", "what", "how", "job", "jobs"],
}


def detect_language(text: str) -> str:
    """Detect language from user text (DE/BS/EN)."""
    text_lower = text.lower()
    scores = {"de": 0, "bs": 0, "en": 0}
    
    for lang, patterns in LANG_PATTERNS.items():
        for pattern in patterns:
            if pattern in text_lower:
                scores[lang] += 1
    
    # Default to German if unclear
    max_lang = max(scores, key=scores.get)
    return max_lang if scores[max_lang] > 0 else "de"


def parse_intent(text: str) -> tuple[str, dict]:
    """
    Parse user text to determine tool and params.
    Returns (tool_name, params_dict).
    """
    text_lower = text.lower().strip()
    
    # List jobs
    if any(kw in text_lower for kw in ["liste job", "list job", "zeige job", "show job", "alle job", "all job", "prikaži poslo"]):
        return "jobs.list", {}
    
    # Get specific job
    job_id_match = re.search(r"job[\s\-_]?id[:\s]*([\w\-]+)", text_lower)
    if job_id_match or "details" in text_lower or "zeige job" in text_lower:
        if job_id_match:
            return "jobs.get", {"job_id": job_id_match.group(1)}
    
    # Create job
    if any(kw in text_lower for kw in ["erstelle job", "create job", "neuer job", "new job", "napravi posao"]):
        # Extract title from quotes or after keyword
        title_match = re.search(r"[\"\']([^\"\']+)[\"\']|(?:erstelle|create|neuer|new)\s+job\s*[:\s]*(.+)", text_lower)
        title = "Neuer Job"
        if title_match:
            title = title_match.group(1) or title_match.group(2) or "Neuer Job"
        return "jobs.create", {"title": title.strip().title()}
    
    # Approve job
    if any(kw in text_lower for kw in ["genehmige", "approve", "bestätige", "odobri"]):
        job_id_match = re.search(r"([\w\-]{36})", text)
        if job_id_match:
            return "jobs.approve", {"job_id": job_id_match.group(1)}
        return "jobs.approve", {}
    
    # Reject job
    if any(kw in text_lower for kw in ["ablehnen", "reject", "verweigere", "odbij"]):
        job_id_match = re.search(r"([\w\-]{36})", text)
        if job_id_match:
            return "jobs.reject", {"job_id": job_id_match.group(1)}
        return "jobs.reject", {}
    
    # Default: unclear
    return "", {}


# Response translations
TRANSLATIONS = {
    "de": {
        "understood": "Verstanden",
        "plan": "Plan",
        "tools": "Tools",
        "confirm_question": "Soll ich fortfahren? (ja/nein)",
        "execute_instruction": "Schreibe: EXECUTE {action}",
        "success": "Erfolgreich ausgeführt",
        "error": "Fehler",
        "unclear": "Ich habe nicht verstanden was du möchtest. Bitte sage z.B.:\n- \"Liste Jobs\"\n- \"Erstelle Job: Titel\"\n- \"Genehmige Job <ID>\"",
    },
    "bs": {
        "understood": "Razumijem",
        "plan": "Plan",
        "tools": "Alati",
        "confirm_question": "Da li da nastavim? (da/ne)",
        "execute_instruction": "Napiši: EXECUTE {action}",
        "success": "Uspješno izvršeno",
        "error": "Greška",
        "unclear": "Nisam razumio šta želiš. Molim reci npr.:\n- \"Prikaži poslove\"\n- \"Napravi posao: Naslov\"\n- \"Odobri posao <ID>\"",
    },
    "en": {
        "understood": "Understood",
        "plan": "Plan",
        "tools": "Tools",
        "confirm_question": "Should I proceed? (yes/no)",
        "execute_instruction": "Type: EXECUTE {action}",
        "success": "Successfully executed",
        "error": "Error",
        "unclear": "I didn't understand what you want. Please say e.g.:\n- \"List jobs\"\n- \"Create job: Title\"\n- \"Approve job <ID>\"",
    },
}


def get_tool_info(tool: str) -> dict:
    """Get tool metadata."""
    TOOL_INFO = {
        "jobs.list": {"type": "READ", "description": "List all jobs"},
        "jobs.get": {"type": "READ", "description": "Get job details"},
        "jobs.create": {"type": "WRITE", "description": "Create a new job"},
        "jobs.approve": {"type": "WRITE", "description": "Approve a job"},
        "jobs.reject": {"type": "WRITE", "description": "Reject a job"},
    }
    return TOOL_INFO.get(tool, {"type": "UNKNOWN", "description": tool})


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
    confirm_question: str
    # For WRITE tools
    confirm_token: Optional[str] = None
    execute_instruction: Optional[str] = None
    # Raw data for execute
    parsed_tool: Optional[str] = None
    parsed_params: Optional[dict] = None
    error: Optional[str] = None


class ExecuteRequest(BaseModel):
    execute_command: str  # Must be "EXECUTE <ACTION>"
    confirm_token: Optional[str] = None
    tool: str
    params: dict = {}


class ExecuteResponse(BaseModel):
    status: str  # "ok", "error"
    language: str
    message: str
    result: Optional[dict] = None
    error: Optional[str] = None


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
    Does NOT execute any tools - only returns what would be done.
    """
    text = request.text.strip()
    lang = request.language or detect_language(text)
    t = TRANSLATIONS.get(lang, TRANSLATIONS["de"])
    
    # Parse intent
    tool, params = parse_intent(text)
    
    if not tool:
        return PlanResponse(
            status="unclear",
            language=lang,
            summary=[t["unclear"]],
            plan=[],
            tools=[],
            tool_type="",
            confirm_question="",
            error=t["unclear"],
        )
    
    tool_info = get_tool_info(tool)
    tool_type = tool_info["type"]
    
    # Build summary
    summary = [
        f"{t['understood']}: {text}",
        f"Tool: {tool}",
        f"Type: {tool_type}",
    ]
    if params:
        summary.append(f"Parameters: {params}")
    
    # Build plan
    plan = [f"1. {tool_info['description']}"]
    if params:
        plan.append(f"2. Mit Parametern: {params}")
    
    # For READ tools, execute immediately to show result
    if tool_type == "READ":
        status_code, mcp_result = await call_mcp(tool, params)
        
        if status_code >= 400 or mcp_result.get("status") == "error":
            return PlanResponse(
                status="error",
                language=lang,
                summary=summary,
                plan=plan,
                tools=[tool],
                tool_type=tool_type,
                confirm_question="",
                error=mcp_result.get("error", "MCP Error"),
                parsed_tool=tool,
                parsed_params=params,
            )
        
        return PlanResponse(
            status="ok",
            language=lang,
            summary=summary,
            plan=plan,
            tools=[tool],
            tool_type=tool_type,
            confirm_question="",
            parsed_tool=tool,
            parsed_params=params,
            confirm_token=None,
            execute_instruction=None,
        )
    
    # For WRITE tools, get confirm token from MCP
    status_code, mcp_result = await call_mcp(tool, params, confirm=False)
    
    if mcp_result.get("status") == "error":
        return PlanResponse(
            status="error",
            language=lang,
            summary=summary,
            plan=plan,
            tools=[tool],
            tool_type=tool_type,
            confirm_question="",
            error=mcp_result.get("error", "MCP Error"),
            parsed_tool=tool,
            parsed_params=params,
        )
    
    confirm_token = mcp_result.get("confirm_token")
    action_name = tool.split(".")[-1].upper()
    
    return PlanResponse(
        status="plan",
        language=lang,
        summary=summary,
        plan=plan,
        tools=[tool],
        tool_type=tool_type,
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
    Requires EXECUTE command and confirm_token for WRITE tools.
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
    tool_info = get_tool_info(tool)
    
    # For WRITE tools, require confirm_token
    if tool_info["type"] == "WRITE":
        if not request.confirm_token:
            return ExecuteResponse(
                status="error",
                language=lang,
                message="",
                error="confirm_token required for WRITE operations",
            )
        
        # Execute with confirmation
        status_code, mcp_result = await call_mcp(
            tool, params, confirm=True, confirm_token=request.confirm_token
        )
    else:
        # READ tools execute directly
        status_code, mcp_result = await call_mcp(tool, params)
    
    if status_code >= 400 or mcp_result.get("status") == "error":
        return ExecuteResponse(
            status="error",
            language=lang,
            message="",
            error=mcp_result.get("error", "Execution failed"),
        )
    
    return ExecuteResponse(
        status="ok",
        language=lang,
        message=t["success"],
        result=mcp_result.get("result"),
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
