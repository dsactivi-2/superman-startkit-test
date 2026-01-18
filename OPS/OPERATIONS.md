# OPERATIONS.md
Monitoring:
- /health + /version
- Error rate + latency (MVP: logs; später: metrics/tracing)

Backups:
- tägliche DB Backups + offsite Kopie

Release:
- git tag releases
- rollback via checkout tag + docker compose up -d --build
