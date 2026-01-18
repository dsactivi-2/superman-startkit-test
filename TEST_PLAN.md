# TEST_PLAN.md
Minimum MVP:
- Unit: state transitions
- Integration: /health,/version,/login,/jobs,/job details,/approve
- E2E (web): login -> open job -> approve -> state updated
- Smoke: scripts/smoke_test.sh BASE_URL
CI Gate: build fails wenn Function Registry Einträge ohne Testreferenz.
