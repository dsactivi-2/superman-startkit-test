# Slack App Setup

Diese Anleitung beschreibt, wie du die Slack Integration für AI Supervisor einrichtest.

## 1. Slack App erstellen

1. Gehe zu https://api.slack.com/apps
2. Klick **"Create New App"**
3. Wähle **"From scratch"**
4. Name: `AI Supervisor` (oder beliebig)
5. Workspace auswählen
6. Klick **"Create App"**

## 2. Signing Secret kopieren

1. Unter **"Basic Information"** → **"App Credentials"**
2. Kopiere **"Signing Secret"**
3. Setze in `.env`:
   ```
   SLACK_SIGNING_SECRET=<dein-signing-secret>
   ```

## 3. Event Subscriptions aktivieren

1. Gehe zu **"Event Subscriptions"**
2. Schalte **"Enable Events"** auf **ON**
3. **Request URL** setzen:
   ```
   https://<deine-domain>/integrations/slack/events
   ```
   - Für lokale Entwicklung: nutze ngrok oder ähnlich
   - Slack sendet einen Challenge Request zur Verifizierung

4. Unter **"Subscribe to bot events"** hinzufügen:
   - `app_mention` - wenn @AI Supervisor erwähnt wird
   - `message.channels` - (optional) alle Channel-Nachrichten
   - `message.im` - (optional) Direktnachrichten

5. Klick **"Save Changes"**

## 4. Bot Token erstellen (für Antworten)

1. Gehe zu **"OAuth & Permissions"**
2. Unter **"Scopes"** → **"Bot Token Scopes"** hinzufügen:
   - `chat:write` - um Nachrichten zu senden
   - `app_mentions:read` - um Mentions zu lesen
   - `channels:history` - (optional) Channel-Nachrichten lesen
   - `im:history` - (optional) DMs lesen

3. Klick **"Install to Workspace"**
4. Kopiere **"Bot User OAuth Token"** (beginnt mit `xoxb-`)
5. Setze in `.env`:
   ```
   SLACK_BOT_TOKEN=xoxb-...
   ```

## 5. App zu Channel einladen

1. In Slack: gehe zum gewünschten Channel
2. Tippe `/invite @AI Supervisor`
3. Oder: Channel Settings → Integrations → Add App

## 6. Lokale Entwicklung mit ngrok

Für lokale Tests brauchst du einen Tunnel:

```bash
# ngrok installieren (https://ngrok.com)
ngrok http 8000
```

Dann die ngrok URL in Slack Event Subscriptions eintragen:
```
https://abc123.ngrok.io/integrations/slack/events
```

## 7. Environment Variables

```env
# Pflicht für Signaturverifizierung
SLACK_SIGNING_SECRET=<signing-secret>

# Optional für Bot-Antworten
SLACK_BOT_TOKEN=xoxb-...
```

## 8. Testen

1. In Slack: `@AI Supervisor Bitte erstelle einen Report`
2. Bot antwortet mit Job-ID
3. Im Web-UI unter `/jobs` erscheint der neue Job

## Troubleshooting

### "Invalid Slack signature"
- Prüfe ob `SLACK_SIGNING_SECRET` korrekt gesetzt ist
- Prüfe ob der Container neu gestartet wurde nach .env Änderung

### "Request URL not verified"
- Stelle sicher, dass die URL öffentlich erreichbar ist
- Prüfe Logs: `docker compose logs api`

### Bot antwortet nicht
- Prüfe ob `SLACK_BOT_TOKEN` gesetzt ist
- Prüfe ob Bot die `chat:write` Permission hat
- Prüfe ob Bot zum Channel eingeladen wurde
