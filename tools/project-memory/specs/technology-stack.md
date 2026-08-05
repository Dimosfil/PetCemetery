# Technology Stack

Last reviewed: 2026-07-31

Canonical source: this file
Linked from: `README.md`, `AGENTS.md`

This is project documentation. Keep business rules, feature algorithms, workflow
contracts, state machines, and verification guarantees in project memory; keep
stack facts, commands, runtime assumptions, and operational notes here.

## Summary

- Primary stack: TypeScript, Next.js, React, PostgreSQL, Docker
- Runtime model: one responsive web service with server routes and PostgreSQL
- Current confidence: verified from current manifests and source entry points

## Components

| Layer | Technology | Evidence | Notes |
| --- | --- | --- | --- |
| Language/runtime | TypeScript / Node.js 24 | `package.json`, `Dockerfile` | Strict TypeScript |
| Frontend | React 19 / Next.js 16 | `app/`, `components/` | Responsive App Router UI |
| Backend/API | Next.js route handlers | `app/api/` | Server-only database and secrets |
| Data/storage | PostgreSQL 17, local persistent uploads | `db/schema.sql`, `compose.yaml` | External PostgreSQL supported |
| Map | Leaflet with configurable tile provider | `components/MapPicker.tsx`, `components/MapBrowser.tsx` | OSM public tiles are development default only |
| Build/package | npm / Next standalone output | `package.json`, `next.config.ts` | Docker multi-stage build |
| Test/quality | Vitest, TypeScript, ESLint | `tests/`, `eslint.config.mjs` | Unit and production build checks |
| Deployment/runtime | Docker Compose | `Dockerfile`, `compose.yaml` | App plus optional local database |

## Isolated Unity reconstruction prototype

This experimental contour is outside the current web MVP runtime and release.

| Layer | Technology | Evidence | Notes |
| --- | --- | --- | --- |
| Prototype Web UI/API | JavaScript / Node.js 24 built-ins | `PetCemeteryUnityApp/PetAvatarPrototype/` | Local loopback service, no package dependencies |
| Artifact format | GLB 2.0 plus ZIP | `src/pipeline/glb-builder.js`, `src/lib/zip.js` | Rigged mesh, textures, manifest, preview |
| Reconstruction implementation | Procedural integration provider | `src/pipeline/procedural-reconstruction-provider.js` | Not production AI likeness reconstruction |
| Unity viewer | Unity 6000.3.10f1 / C# / URP | `PetCemeteryUnityApp/My project (1)/Assets/PetAvatarPrototype/` | Narrow loader for the prototype GLB profile |

## Commands

| Purpose | Command | Evidence |
| --- | --- | --- |
| Install | `npm install` | `package.json` |
| Run | `npm run dev` | `package.json` |
| Test | `npm run typecheck; npm run lint; npm test` | `package.json` |
| Build | `npm run build; docker compose build` | `package.json`, `compose.yaml` |

## External Services

| Service | Role | Evidence | Boundary |
| --- | --- | --- | --- |
| PostgreSQL | Durable application data | `DATABASE_URL` | Credentials are server-only secrets |
| Map tile provider | Basemap rendering | `NEXT_PUBLIC_TILE_URL` | Must be selected for production limits/terms |
| Google OAuth | Optional account authentication | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL` | Secrets and token exchange are server-only |

## Gaps

- Production object storage is not yet selected; MVP uses a persistent volume.
- Transactional email and email verification are not implemented.
- Production map tile and geocoding providers are not selected.
