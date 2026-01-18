# SECURITY.md
- Secrets niemals in Git. Nur `.env` auf Server oder Secret Manager.
- HTTPS only (Reverse Proxy).
- /auth/login rate limit.
- CORS nur auf deine Web-Origin.
- Slack Signatures verifizieren.
- Logs ohne Tokens/Passwörter/PII.
- DB least privilege + Backups.
