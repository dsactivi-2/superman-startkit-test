# MASTER_RUNBOOK.md — Step-by-Step (MVP-first)

Prinzip:
- 1 Step pro Antwort (bei KI)
- Contracts first: `CONTRACTS/*`
- Keine stillen Änderungen (nur mit `ÄNDERUNG ERLAUBT:`)
- Function Registry Gate: jede Funktion braucht Tests

## Steps
0) Scope Freeze (MVP)
1) Repo Setup + CI Grundgerüst
2) Local Dev: docker compose up
3) Contracts finalisieren (API/DB/Events)
4) Backend Skeleton (FastAPI) + /health + /version + error format
5) Auth (Admin-only MVP) + Rate limit
6) Slack Intake (verify signing secret) + thread updates
7) Job Engine + States + Approval Hook + Persistenz
8) Web UI (Next) Login + Jobs + Approvals
9) Tests: Unit+Integration+E2E+Smoke
10) Deploy Weg B (1 Server) + Post-Deploy Smoke
11) PRO Module als Epics einschalten

Siehe Details:
- `DEPLOY/DEPLOY_B_SERVER.md`
- `SECURITY/SECURITY.md`
- `OPS/OPERATIONS.md`
