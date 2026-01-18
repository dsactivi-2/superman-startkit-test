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
