# MCP Tool Server Setup

Der MCP (Model Context Protocol) Tool Server ermöglicht es AI-Assistenten (wie OpenWebUI),
mit dem AI Supervisor zu interagieren.

## Sicherheitskonzept

Der MCP Server ist **safe-by-default**:

- **READ Tools** (jobs.list, jobs.get) werden sofort ausgeführt
- **WRITE Tools** (jobs.create, jobs.approve, jobs.reject) erfordern einen **2-Step Confirm Flow**:
  1. Erster Aufruf → Server antwortet mit `plan` + `confirm_token`
  2. Zweiter Aufruf mit `confirm: true` + `confirm_token` → Ausführung

## 1. Environment Variables

In `.env` hinzufügen (NICHT committen!):

```bash
# MCP Server Secret (für Authentifizierung)
# Generiere mit: openssl rand -hex 32
MCP_SHARED_SECRET=dein-geheimes-token-hier

# Optional: Admin Token für API Zugriff
# Wenn gesetzt, nutzt MCP diesen Token für API Calls
MCP_ADMIN_TOKEN=
```

## 2. Starten

```bash
docker compose up -d --build
```

Der MCP Server ist dann erreichbar unter:
- **Intern**: http://mcp:3333 (für andere Container)
- **Extern**: http://localhost:3333 (für lokale Tests)

## 3. Health Check

```bash
curl http://localhost:3333/health
# {"status":"ok","service":"mcp"}
```

## 4. Verfügbare Tools

| Tool | Typ | Beschreibung |
|------|-----|--------------|
| `jobs.list` | READ | Liste aller Jobs |
| `jobs.get` | READ | Job Details (params: job_id) |
| `jobs.create` | WRITE | Job erstellen (params: title, payload) |
| `jobs.approve` | WRITE | Job genehmigen (params: job_id) |
| `jobs.reject` | WRITE | Job ablehnen (params: job_id) |
| `jobs.set_needs_approval` | TEST | Status auf needs_approval setzen |
| `slack.simulate_mention` | TEST | Slack Mention simulieren |

Tools abrufen:
```bash
curl http://localhost:3333/tools \
  -H "X-MCP-SECRET: dein-geheimes-token-hier"
```

## 5. Tool ausführen

### READ Tool (sofortige Ausführung)

```bash
# Jobs auflisten
curl -X POST http://localhost:3333/run \
  -H "Content-Type: application/json" \
  -H "X-MCP-SECRET: dein-geheimes-token-hier" \
  -d '{"tool": "jobs.list", "params": {}}'

# Antwort:
# {"status":"ok","tool":"jobs.list","result":[...]}
```

### WRITE Tool (2-Step Confirm)

**Schritt 1: Plan anfordern**
```bash
curl -X POST http://localhost:3333/run \
  -H "Content-Type: application/json" \
  -H "X-MCP-SECRET: dein-geheimes-token-hier" \
  -d '{"tool": "jobs.create", "params": {"title": "Test Job"}}'

# Antwort:
# {
#   "status": "plan",
#   "tool": "jobs.create",
#   "require_confirm": true,
#   "confirm_token": "abc123-...",
#   "plan_summary": "Create job: 'Test Job'"
# }
```

**Schritt 2: Bestätigen und ausführen**
```bash
curl -X POST http://localhost:3333/run \
  -H "Content-Type: application/json" \
  -H "X-MCP-SECRET: dein-geheimes-token-hier" \
  -d '{
    "tool": "jobs.create",
    "params": {"title": "Test Job"},
    "confirm": true,
    "confirm_token": "abc123-..."
  }'

# Antwort:
# {"status":"ok","tool":"jobs.create","result":{"id":"...", ...}}
```

## 6. OpenWebUI Integration

### Allgemeine Konfiguration

1. In OpenWebUI: Navigiere zu den MCP/Tool Einstellungen
2. Füge einen neuen MCP Server hinzu:
   - **URL**: `http://localhost:3333` (oder Docker-Netzwerk: `http://mcp:3333`)
   - **Auth Header**: `X-MCP-SECRET: <dein-secret>`

### Request Format

OpenWebUI sollte Requests im folgenden Format senden:

```json
POST /run
Content-Type: application/json
X-MCP-SECRET: <secret>

{
  "tool": "jobs.list",
  "params": {}
}
```

Für WRITE Tools:
```json
{
  "tool": "jobs.approve",
  "params": {"job_id": "..."},
  "confirm": true,
  "confirm_token": "..."
}
```

## 7. Beispiel-Workflow

```bash
SECRET="dein-geheimes-token-hier"

# 1. Jobs auflisten
curl -X POST http://localhost:3333/run \
  -H "Content-Type: application/json" \
  -H "X-MCP-SECRET: $SECRET" \
  -d '{"tool": "jobs.list"}'

# 2. Job erstellen (Schritt 1: Plan)
RESPONSE=$(curl -s -X POST http://localhost:3333/run \
  -H "Content-Type: application/json" \
  -H "X-MCP-SECRET: $SECRET" \
  -d '{"tool": "jobs.create", "params": {"title": "MCP Test Job"}}')

echo $RESPONSE
# -> {"status":"plan","confirm_token":"...","plan_summary":"Create job: 'MCP Test Job'"}

# 3. Token extrahieren und bestätigen
TOKEN=$(echo $RESPONSE | grep -o '"confirm_token":"[^"]*"' | cut -d'"' -f4)

curl -X POST http://localhost:3333/run \
  -H "Content-Type: application/json" \
  -H "X-MCP-SECRET: $SECRET" \
  -d "{\"tool\": \"jobs.create\", \"params\": {\"title\": \"MCP Test Job\"}, \"confirm\": true, \"confirm_token\": \"$TOKEN\"}"

# -> {"status":"ok","result":{"id":"...","title":"MCP Test Job","status":"queued",...}}
```

## Troubleshooting

### "MCP_SHARED_SECRET not configured"
- Prüfe ob `MCP_SHARED_SECRET` in `.env` gesetzt ist
- Container neu starten: `docker compose up -d`

### "Invalid MCP secret"
- Prüfe ob der Header `X-MCP-SECRET` korrekt gesetzt ist
- Secret muss exakt übereinstimmen (keine Whitespaces)

### "Invalid or expired confirm_token"
- Confirm Tokens sind nur 5 Minuten gültig
- Tokens sind einmalig verwendbar
- Tool und Params müssen übereinstimmen

### API Fehler (401, 404, etc.)
- Prüfe ob `MCP_ADMIN_TOKEN` gesetzt ist (optional)
- Prüfe ob die API unter http://api:8000 erreichbar ist
- Container Logs prüfen: `docker compose logs mcp`
