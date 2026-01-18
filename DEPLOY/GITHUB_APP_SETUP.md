# GitHub App Setup (Stufe A - Sicher, ohne PAT)

Diese Anleitung beschreibt, wie du eine GitHub App für AI Supervisor einrichtest.
GitHub Apps sind sicherer als Personal Access Tokens und ermöglichen granulare Berechtigungen.

## 1. GitHub App erstellen

1. Gehe zu **GitHub** → **Settings** → **Developer settings** → **GitHub Apps**
2. Klick **"New GitHub App"**

### App Settings

| Feld | Wert |
|------|------|
| **GitHub App name** | `AI Supervisor` (oder beliebig, muss eindeutig sein) |
| **Homepage URL** | `https://deine-domain.tld` (oder Platzhalter) |
| **Webhook URL** | `https://<API_DOMAIN>/integrations/github/webhook` |
| **Webhook secret** | Generiere einen sicheren String (z.B. `openssl rand -hex 32`) |

### Permissions (Stufe A - Minimal)

Unter **"Repository permissions"**:

| Permission | Access |
|------------|--------|
| **Metadata** | Read-only (automatisch) |
| **Issues** | Read and write |
| **Pull requests** | Read and write |
| **Checks** | Read and write (optional, für Status Updates) |
| **Commit statuses** | Read and write (optional) |

### Subscribe to events

Aktiviere:
- [x] **Issues**
- [x] **Pull request**

### Where can this app be installed?

- [x] **Only on this account** (für Org-Installation)

3. Klick **"Create GitHub App"**

## 2. Private Key generieren

1. Nach dem Erstellen: Scrolle zu **"Private keys"**
2. Klick **"Generate a private key"**
3. Eine `.pem` Datei wird heruntergeladen
4. **WICHTIG**: Speichere diese Datei sicher! Sie wird nur einmal bereitgestellt.

## 3. App installieren

1. Gehe zur App-Seite → **"Install App"**
2. Wähle die Organisation/Account
3. Wähle **"All repositories"** oder spezifische Repos
4. Klick **"Install"**

## 4. Installation ID finden

Nach der Installation:
1. Gehe zu **GitHub** → **Settings** → **Applications** → **Installed GitHub Apps**
2. Klick auf deine App → **"Configure"**
3. Die URL enthält die Installation ID:
   ```
   https://github.com/settings/installations/12345678
                                              ^^^^^^^^
                                              Installation ID
   ```

## 5. Environment Variables setzen

In deiner `.env` Datei (NIEMALS committen!):

```bash
# GitHub App ID (von der App Settings Seite)
GITHUB_APP_ID=123456

# Private Key (EINE der beiden Optionen):

# Option A: Inline PEM (mit \n für Zeilenumbrüche)
GITHUB_APP_PRIVATE_KEY_PEM="-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n...\n-----END RSA PRIVATE KEY-----"

# Option B: Pfad zur PEM Datei
GITHUB_APP_PRIVATE_KEY_PATH=/path/to/private-key.pem

# Installation ID
GITHUB_INSTALLATION_ID=12345678

# Webhook Secret (der String den du bei der App-Erstellung gesetzt hast)
GITHUB_WEBHOOK_SECRET=dein-webhook-secret

# Optional: API Base URL (default: https://api.github.com)
GITHUB_API_BASE=https://api.github.com
```

## 6. Docker Container neu starten

```bash
docker compose up -d
```

## 7. Webhook testen

### Option A: Manuell via GitHub

1. Gehe zur App → **"Advanced"** → **"Recent Deliveries"**
2. Du siehst den `ping` Event vom Webhook Setup
3. Erstelle ein Issue oder PR in einem installierten Repo
4. Prüfe die Deliveries für das neue Event

### Option B: Lokale Entwicklung mit ngrok

```bash
# Terminal 1: ngrok starten
ngrok http 8000

# ngrok URL in GitHub App Webhook URL eintragen:
# https://abc123.ngrok.io/integrations/github/webhook
```

## 8. Testen

### Webhook verifizieren

```bash
# Test mit korrekter Signatur (ersetze SECRET)
SECRET="dein-webhook-secret"
PAYLOAD='{"action":"opened","issue":{"number":1,"title":"Test"},"repository":{"full_name":"org/repo"}}'
SIGNATURE="sha256=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | cut -d' ' -f2)"

curl -X POST http://localhost:8000/integrations/github/webhook \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: issues" \
  -H "X-Hub-Signature-256: $SIGNATURE" \
  -d "$PAYLOAD"
```

### Comment/Label Actions (Admin)

```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@local.test","password":"admin123"}' | jq -r '.token')

# Comment hinzufügen
curl -X POST http://localhost:8000/integrations/github/actions/comment \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"repo":"org/repo","issue_number":1,"body":"Hello from AI Supervisor!"}'

# Labels hinzufügen
curl -X POST http://localhost:8000/integrations/github/actions/label \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"repo":"org/repo","issue_number":1,"labels":["needs-approval"]}'
```

## Troubleshooting

### "GitHub integration not configured"
- Prüfe ob `GITHUB_WEBHOOK_SECRET` gesetzt ist
- Container neu starten nach .env Änderung

### "Invalid signature"
- Prüfe ob Webhook Secret in GitHub und .env identisch sind
- Keine Extra-Whitespaces oder Quotes im Secret

### "GitHub API error: 401"
- Private Key ist ungültig oder abgelaufen
- App ID stimmt nicht
- Generiere ggf. einen neuen Private Key

### "GitHub API error: 404"
- Installation ID stimmt nicht
- App ist nicht auf dem Repo installiert
- Prüfe Permissions

## Sicherheitshinweise

1. **Private Key**: Niemals committen, niemals teilen
2. **Webhook Secret**: Mindestens 32 Zeichen, zufällig generiert
3. **Permissions**: Nur das Minimum verwenden
4. **Audit**: Regelmäßig GitHub App Logs prüfen
5. **Rotation**: Private Key regelmäßig rotieren
