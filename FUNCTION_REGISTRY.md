# FUNCTION_REGISTRY.md
Jede Funktion wird registriert und MUSS getestet werden.

F-001 Healthcheck (GET /health) -> Integration + Smoke
F-002 Version (GET /version) -> Integration
F-003 Admin Login (POST /auth/login) -> Integration + RateLimit
F-004 Jobs Liste (GET /jobs) -> Integration
F-005 Job Details (GET /jobs/{id}) -> Integration
F-006 Approval (POST /jobs/{id}/approve) -> Integration + E2E
F-007 Slack Intake (slash/mention) -> Manual Staging + Smoke
