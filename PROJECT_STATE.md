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

#### Nächste Schritte:
- Commit + Push
