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

## Slack (MVP)
- Request verification mit Signing Secret
- Job-Erstellung aus Slash/Mention
- Progress Events in Thread
