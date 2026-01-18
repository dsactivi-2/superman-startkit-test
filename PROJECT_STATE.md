# PROJECT_STATE.md — Single Source of Truth
Datum: 2026-01-18

SCOPE_MODE = MVP   # später: PRO

## Ziel
AI Supervisor Hybrid-Ops: Jobs via Slack starten, im Web überwachen, Approvals für kritische Aktionen, Audit Trail.

## MVP Scope (Freeze)
- Slack Job Intake (slash/mention)
- Job Engine + States
- Approval Hook (einfach)
- Web Admin UI (Login, Jobs, Details, Settings)
- Audit Log minimal
- Deploy + Smoke Tests

## PRO Backlog (nicht jetzt)
- RBAC + Policies
- Parallel Worker Pool + Retries + DLQ
- Observability/Tracing/Alerts
- Integration Preview/Rollback
- Audit Export + Retention

## Freeze (darf nicht geändert werden ohne ÄNDERUNG ERLAUBT)
- Job States: queued/processing/completed/failed/needs-approval
- Event Types: plan/question/needs-approval/progress/final/error
- Error JSON format (siehe api_contract)

---

## AUTOMATION LOG

### 2026-01-18 - MVP Setup Session

**Status: IN PROGRESS**

#### Schritt A-D: Dateien geprüft ✅
- `apps/web/app/layout.tsx` - existiert, korrekt
- `apps/api/app/auth.py` - existiert, Login mit SHA256, Rate Limiting
- `apps/api/app/main.py` - auth_router eingebunden
- `.env` - ADMIN_EMAIL, ADMIN_PASSWORD_HASH, JWT_SECRET gesetzt

#### Schritt E: Docker Compose ✅
- Command: `docker compose up --build -d`
- Alle Container laufen: db, api, web

#### Schritt F: Smoke Tests ✅
- `/health` → `{"status":"ok"}`
- `/version` → `{"version":"0.1.0"}`
- `localhost:3000` → HTTP 200

#### Schritt G: Login Test ✅
- `POST /auth/login` → Token erhalten
- Admin: admin@local.test / admin123

#### Schritt H: Commit + Push
- Code-Dateien committet (ohne .env)
- Gepusht zu origin/main

**Status: COMPLETE**

---

### 2026-01-18 - Web Login UI Session

**Status: IN PROGRESS**

#### Neue Dateien erstellt:
- `apps/web/app/login/page.tsx` - Login-Formular mit Email/Passwort
- `apps/web/app/page.tsx` - Login-Button hinzugefügt

#### Features:
- POST auf `/auth/login`
- Token in localStorage unter "auth_token"
- Redirect auf "/" nach Erfolg
- Error-Handling mit Anzeige

#### Docker Rebuild ✅
- `docker compose up -d --build` erfolgreich
- Login-Route `/login` (1.84 kB)

#### Tests ✅
- `/health` → `{"status":"ok"}`
- `/login` → HTTP 200
- Login-Seite enthält `<h1>Login</h1>`

#### Commit + Push ✅
- Commit: `af2d2d0`
- Gepusht zu origin/main

**Status: COMPLETE**

---

### 2026-01-18 - Jobs API Session

**Status: IN PROGRESS**

#### Neue Dateien:
- `apps/api/app/jobs.py` - Jobs API mit In-Memory Store

#### Endpoints (alle admin-geschützt):
- `GET /jobs` - Liste (neueste zuerst)
- `POST /jobs` - Job erstellen
- `GET /jobs/{id}` - Job Detail
- `POST /jobs/{id}/approve` - Job genehmigen
- `POST /jobs/{id}/reject` - Job ablehnen

#### Job Felder:
- id, title, status, created_at, updated_at, payload, result

#### Status-Werte:
- queued, processing, needs_approval, approved, rejected, failed, completed

#### Tests ✅
- `/health` → ok
- Login → Token erhalten
- `GET /jobs` → `[]`
- `POST /jobs` → Job erstellt (status: queued)
- `GET /jobs/{id}` → Job Detail
- Ohne Token → 401 "Missing token"

#### Commit + Push ✅
- Commit: `df1cca5`
- Gepusht zu origin/main

**Status: COMPLETE**

---

### 2026-01-18 - Jobs UI Session

**Status: IN PROGRESS**

#### Neue Dateien:
- `apps/web/app/jobs/page.tsx` - Job Liste
- `apps/web/app/jobs/[id]/page.tsx` - Job Detail mit Approve/Reject

#### Features:
- Token-Check (redirect zu /login wenn nicht eingeloggt)
- Job Liste mit Status-Farben
- "+ Demo Job" Button zum Testen
- Job Detail mit Payload/Result Anzeige
- Approve/Reject Buttons (nur bei status=needs_approval)
- Login redirect zu /jobs statt /

#### Tests ✅
- `/health` → ok
- `/jobs` → HTTP 200
- Jobs-Seite lädt korrekt

#### Commit + Push ✅
- Commit: `143b141`
- Gepusht zu origin/main

**Status: COMPLETE**

---

### 2026-01-18 - Test Endpoint Security

**Status: IN PROGRESS**

#### Änderungen:
- `jobs.py`: Test-Endpoint prüft ENABLE_TEST_ENDPOINTS env var
- `.env.example`: ENABLE_TEST_ENDPOINTS=false hinzugefügt
- `docker-compose.yml`: ENABLE_TEST_ENDPOINTS weitergegeben (default: false)

#### Verhalten:
- ENABLE_TEST_ENDPOINTS=true → Endpoint verfügbar
- ENABLE_TEST_ENDPOINTS=false/nicht gesetzt → 404 "Not found"

#### Test ✅
- Endpoint liefert 404 "Not found" wenn disabled

#### Commit + Push ✅
- Commit: `1a8fac5`
- Gepusht zu origin/main

**Status: COMPLETE**

---

### 2026-01-18 - Slack Job Intake Session

**Status: IN PROGRESS**

#### Neue Dateien:
- `apps/api/app/slack.py` - Slack Events Handler
- `DEPLOY/SLACK_SETUP.md` - Setup Anleitung

#### Geänderte Dateien:
- `apps/api/app/jobs.py` - `create_job_internal()` hinzugefügt
- `apps/api/app/main.py` - slack_router eingebunden
- `CONTRACTS/api_contract.md` - Slack Endpoint dokumentiert

#### Features:
- POST /integrations/slack/events
- URL Verification (challenge response)
- Slack Signatur-Verifizierung (HMAC-SHA256)
- Replay Protection (5 min)
- Event Deduplication
- app_mention + message Event Support
- Optional: Bot Reply mit Job-ID

#### Environment Variables:
- SLACK_SIGNING_SECRET (required)
- SLACK_BOT_TOKEN (optional, für Replies)

#### Tests ✅
- Health: ok
- URL Verification: challenge returned
- Event → Job erstellt
- Job in /jobs mit Slack-Payload

#### Commit + Push ✅
- Commit: `5c39117`
- Gepusht zu origin/main

**Status: COMPLETE**

---

### 2026-01-18 - GitHub App Integration Session

**Status: IN PROGRESS**

#### Neue Dateien:
- `apps/api/app/github_integration.py` - GitHub Webhook + Actions
- `DEPLOY/GITHUB_APP_SETUP.md` - Setup Anleitung

#### Geänderte Dateien:
- `apps/api/app/main.py` - github_router eingebunden
- `apps/api/requirements.txt` - PyJWT, cryptography hinzugefügt
- `CONTRACTS/api_contract.md` - GitHub Endpoints dokumentiert
- `.env.example` - GitHub env vars hinzugefügt
- `docker-compose.yml` - GitHub env vars weitergeleitet

#### Endpoints:
- `POST /integrations/github/webhook` - Webhook mit Signatur-Prüfung
- `POST /integrations/github/actions/comment` - Kommentar hinzufügen (admin)
- `POST /integrations/github/actions/label` - Labels hinzufügen (admin)

#### Features:
- Webhook Signatur-Verifizierung (X-Hub-Signature-256, HMAC-SHA256)
- GitHub App JWT Erstellung (RS256)
- Installation Token abrufen
- Events: pull_request, issues, ping
- Job-Erstellung aus PR/Issue Events

#### Environment Variables:
- GITHUB_WEBHOOK_SECRET (required für Webhook)
- GITHUB_APP_ID (required für Actions)
- GITHUB_APP_PRIVATE_KEY_PEM oder _PATH
- GITHUB_INSTALLATION_ID
- GITHUB_API_BASE (optional)

#### Security:
- Keine Secrets geloggt
- Private Key nur aus ENV
- Signatur-Prüfung vor JSON-Parsing
- Timeouts auf API Calls (10s)

#### Nächste Schritte:
- Docker rebuild + Tests
- Commit + Push
