# DEPLOY_B_SERVER.md — Deploy Weg B (1 Server, Docker Compose)

## Voraussetzung
- Ubuntu/Debian Server
- DNS: app.deinedomain.tld und api.deinedomain.tld zeigen auf Server-IP
- Ports offen: 80/443/22

## 1) Docker installieren (Ubuntu)
Siehe `DEPLOY/server_setup_ubuntu.sh` (copy/paste).

## 2) Repo nach /opt
```bash
sudo mkdir -p /opt/ai-supervisor
sudo chown -R $USER:$USER /opt/ai-supervisor
cd /opt/ai-supervisor
git clone <REPO_URL> .
```

## 3) .env setzen
```bash
cp .env.example .env
nano .env
```
Setze mindestens: JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD_HASH, Slack Secrets.

## 4) Reverse Proxy + HTTPS (Caddy)
Siehe `DEPLOY/caddy/Caddyfile.example` + `DEPLOY/caddy/install_caddy_ubuntu.sh`

## 5) Start
```bash
docker compose pull
docker compose up -d
docker compose ps
docker compose logs -f --tail=100
```

## 6) Smoke Tests
```bash
./scripts/smoke_test.sh https://api.deinedomain.tld
curl -I https://app.deinedomain.tld
```

## 7) Update
```bash
git pull
docker compose up -d --build
./scripts/smoke_test.sh https://api.deinedomain.tld
```

## 8) Backup (wenn DB im Compose)
Siehe `OPS/backup_postgres.sh`
