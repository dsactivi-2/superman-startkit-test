# START_HERE — Easy Start (MVP-first, Deploy Weg B = 1 Server)

Datum: 2026-01-18

## Was du bekommst
Dieses Bundle ist ein Repo-Template + Runbooks + Prompts für:
- **MVP zuerst**, später **PRO Module**
- **Monorepo**: `apps/web` (Next.js) + `apps/api` (FastAPI)
- **Docker Compose** lokal und auf Server
- **Security & Ops** Checklisten
- **Dynamische Agentenanzahl** (5–12), abhängig vom Projektplan

---

## In 15 Minuten: Lokal starten (ohne Cloud)
1) ZIP entpacken
2) Terminal im Ordner öffnen
3) Datei `.env` anlegen:
   - `cp .env.example .env`
4) Start:
   - `docker compose up`
5) Prüfen:
   - Web: http://localhost:3000
   - API: http://localhost:8000/health
   - API Docs: http://localhost:8000/docs

Wenn das läuft, ist dein Setup OK.

---

## In 30–60 Minuten: Als GitHub Template Repo nutzen
1) Neues Repo in GitHub erstellen (leer)
2) Inhalt dieses Bundles hochladen (Upload files oder git push)
3) Repo: Settings → **Template repository** aktivieren ✅
4) Neues Projekt erstellen: **Use this template**

---

## Ab jetzt ohne Chaos bauen (KI-Steuerung)
### Schritt A: Orchestrator erzeugt Plan + Agentenanzahl
- Öffne einen neuen Chat mit deiner Coding-KI
- Kopiere: `PROMPTS/ORCHESTRATOR_PROMPT.md`
- Füge dazu die MVP/PRO PDFs oder deren Kernaussagen ein
- Ergebnis: `AGENT_ASSIGNMENTS.md` + aktualisierte Contracts/Registry/Runbook

### Schritt B: Agenten parallel arbeiten
- Öffne N Tabs (wie viele Agenten der Plan sagt)
- Pro Tab: `PROMPTS/AGENT_TEMPLATE.md` + Runbook/Contracts/Registry einfügen
- Jeder Agent liefert **Artefakte** (Dateien/Specs/Tests), kein Gelaber

### Schritt C: Integrator führt zusammen
- Integrator nutzt `PROMPTS/INTEGRATOR_PROMPT.md`
- Nur mergen, wenn Contracts eingehalten + Tests grün

---

## Deploy Weg B (1 Server) — ultra-kurz
Siehe: `DEPLOY/DEPLOY_B_SERVER.md`
