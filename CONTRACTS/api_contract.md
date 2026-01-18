# CONTRACTS/api_contract.md
Regel: UI und API dürfen nur das nutzen, was hier steht.

## Standard Error
{ "error": { "code": "string", "message": "string", "request_id": "string", "details": {} } }

## MVP Endpoints
GET /health -> 200 { "status": "ok" }
GET /version -> 200 { "version": "0.1.0" }

POST /auth/login
- input: { "email": "string", "password": "string" }
- output: { "token": "string", "user": { "id":"string","email":"string","role":"admin" } }
- errors: 400, 401, 429

GET /jobs (auth)
GET /jobs/{id} (auth)
POST /jobs/{id}/approve (auth) input { "approve": true, "comment": "string" }

POST /jobs (auth)
- input: { "title": "string", "payload": {} }
- output: { "id": "string", "title": "string", "status": "queued", ... }
- errors: 400, 401

POST /jobs/{id}/reject (auth)
- output: { ... job with status "rejected" }
- errors: 400 (wrong status), 401, 404

## Slack Integration

POST /integrations/slack/events
- Slack Events API endpoint
- Headers: X-Slack-Request-Timestamp, X-Slack-Signature
- URL Verification: { "type": "url_verification", "challenge": "..." } -> { "challenge": "..." }
- Event Callback: { "type": "event_callback", "event": { "type": "app_mention", ... } }
- Response: { "ok": true, "job_id": "..." }
- Errors: 401 (invalid signature), 400 (invalid JSON)

### Supported Events
- `app_mention` - Creates job when @bot is mentioned
- `message` - Creates job for direct messages

### Environment Variables
- `SLACK_SIGNING_SECRET` - Required for signature verification
- `SLACK_BOT_TOKEN` - Optional, for posting replies

## GitHub Integration

POST /integrations/github/webhook (public)
- GitHub App webhook endpoint
- Headers: X-Hub-Signature-256, X-GitHub-Event
- Signature verification with HMAC-SHA256
- Response: { "ok": true, "job_id": "..." }
- Errors: 401 (invalid signature), 500 (not configured)

### Supported Events
- `pull_request` (actions: opened, reopened, synchronize) - Creates job
- `issues` (actions: opened, reopened) - Creates job
- `ping` - Acknowledges webhook setup

POST /integrations/github/actions/comment (auth)
- Add comment to GitHub issue/PR
- input: { "repo": "org/repo", "issue_number": 123, "body": "text" }
- output: { "ok": true, "comment_id": 123 }
- errors: 401, 500 (not configured), 502 (GitHub API error)

POST /integrations/github/actions/label (auth)
- Add labels to GitHub issue/PR
- input: { "repo": "org/repo", "issue_number": 123, "labels": ["label1"] }
- output: { "ok": true, "labels": ["label1"] }
- errors: 401, 500, 502

### Environment Variables
- `GITHUB_WEBHOOK_SECRET` - Required for webhook signature
- `GITHUB_APP_ID` - Required for API actions
- `GITHUB_APP_PRIVATE_KEY_PEM` - Required (or GITHUB_APP_PRIVATE_KEY_PATH)
- `GITHUB_INSTALLATION_ID` - Required for API actions
