# Agent Runbook

Every command should be copy-pasteable from the project root.

## Install

```powershell
npm install
```

## Run

```powershell
Copy-Item .env.example .env
# Set unique DATABASE_URL and SESSION_SECRET values, then:
npm run db:migrate
npm run dev
```

## Test

```powershell
npm run typecheck
npm run lint
npm test
```

## Build

```powershell
npm run build
docker compose build
```

## Smoke Check

```powershell
Invoke-WebRequest -Uri http://localhost:3000 -UseBasicParsing
Invoke-RestMethod -Uri http://localhost:3000/api/health
Invoke-RestMethod -Uri http://localhost:3000/api/map
```

Expected result:

```text
The home page returns HTTP 200 and /api/map returns a JSON array.
```

## Logs

```powershell
docker compose logs --tail 100 app
docker compose logs --tail 100 db
```

## Environment Notes

- Node.js 24+ and Docker are the supported local runtimes.
- Secrets belong in `.env` or host secret storage and must not be committed.
- Public OSM tile endpoints are a development default, not an assumed
  production tile-hosting contract.
- External PostgreSQL deployments set `DATABASE_URL`; local Docker development
  uses the Compose `db` service.
- Set `COOKIE_SECURE=true` behind the production HTTPS reverse proxy; local HTTP
  development uses `false`.
