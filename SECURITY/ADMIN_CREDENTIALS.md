# ADMIN_CREDENTIALS.md
Keine Default-Admin Logins im Code/Repo.

So vergisst du die Daten nie:
1) Passwort-Manager Eintrag (Bitwarden/1Password):
   - URL Web
   - Admin Email
   - Admin Passwort
   - 2FA Recovery (falls aktiv)
2) Auf dem Server in `.env` nur:
   - ADMIN_EMAIL
   - ADMIN_PASSWORD_HASH (kein Klartext)
3) Optional: ADMIN_BOOTSTRAP_TOKEN (nur initial, danach entfernen)

Empfohlen: Admin wird beim ersten Start aus ENV erzeugt; danach Passwort im UI ändern.
