# foreverApp

## What this is

foreverApp is a Discord Embedded App for relationship matching and pair activities. It supports onboarding, match cards, likes, pair creation, questionnaires, activity suggestions, check-ins, entitlements, and audit events.

## Tech stack

- Next.js
- React
- TypeScript
- MongoDB/Mongoose
- Discord Embedded App SDK
- Zod
- custom session cookie auth

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | yes | MongoDB connection |
| `NEXT_PUBLIC_DISCORD_CLIENT_ID` | yes | Discord client ID |
| `DISCORD_CLIENT_SECRET` | yes | Discord OAuth secret |
| `DISCORD_REDIRECT_URI` | recommended | Server-side Discord OAuth redirect allowlist value |
| `NEXT_PUBLIC_DISCORD_REDIRECT_URI` | yes | Discord SDK redirect; server fallback only when `DISCORD_REDIRECT_URI` is absent |
| `JWT_SECRET` | yes | App session signing |

## Main commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start local Next dev server |
| `npm run build` | Build production app |
| `npm run start` | Start production server after build |
| `npm run lint` | Run existing lint command |
| `npm run check:lint` | Agent alias for lint |
| `npm run check:types` | Run TypeScript no-emit check |
| `npm run check:build` | Agent alias for production build |
| `npm run check:self` | Run fast selfchecks |
| `npm run check:agents` | Run compact agent diagnostics |
| `npm run check:agents:json` | Run machine-readable agent diagnostics |
| `npm run check:agents:changed` | Run agent diagnostics on changed files |
| `npm run check:quick` | Run types, fast selfchecks, and agent diagnostics |
| `npm run selfcheck:activity-flow` | Check activity flow invariants |
| `npm run selfcheck:client-errors` | Check client error mapping |
| `npm run seed:questions` | Seed questionnaire data |

## Project map

See `docs/PROJECT_MAP.md`.

## Working with Codex / agents

Start with `AGENTS.md` and `docs/INDEX.md`.
