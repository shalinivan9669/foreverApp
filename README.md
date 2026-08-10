# foreverApp

## What this is

foreverApp is a Discord Embedded App for an existing adult couple. The MVP links two consenting users, turns separate weekly check-ins into a privacy-safe pair summary, recommends one shared activity, collects separate feedback, and records a bounded shared history. Legacy matching surfaces remain compatibility-only and are not the primary product loop.

## Tech stack

- Next.js
- React
- TypeScript
- MongoDB/Mongoose
- Discord Embedded App SDK
- Zod
- custom session cookie auth

## Quick start

Node.js 20.9 or newer is required (the release checks currently run on Node 24).

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. MongoDB must support transactions; local release verification uses a replica set.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | yes | MongoDB connection |
| `NEXT_PUBLIC_DISCORD_CLIENT_ID` | yes | Discord client ID |
| `DISCORD_CLIENT_SECRET` | yes | Discord OAuth secret |
| `DISCORD_REDIRECT_URI` | conditionally | Preferred server-side Discord OAuth redirect allowlist value; one redirect variable is required |
| `NEXT_PUBLIC_DISCORD_REDIRECT_URI` | conditionally | Discord SDK redirect and server fallback when `DISCORD_REDIRECT_URI` is absent |
| `JWT_SECRET` | yes | App session signing; minimum 32 characters |
| `ENTITLEMENTS_ADMIN_KEY` | no | Legacy entitlement-grant admin key; minimum 32 characters when set |
| `BILLING_MODE` | no | `disabled` (default) or locally verifiable `sandbox` |
| `BILLING_WEBHOOK_SECRET` | with sandbox | HMAC secret for sandbox billing webhook; minimum 32 characters |
| `TRUSTED_PROXY_MODE` | no | `disabled` (default) or `x-forwarded-for` only behind ingress that overwrites and validates the header |

Runtime startup validates this contract. Production billing is intentionally not enabled by this repository-only release candidate.

With `TRUSTED_PROXY_MODE=disabled`, forwarded headers are ignored and anonymous IP-keyed limits are skipped instead of sharing one global fallback bucket. Authenticated mutation limits remain isolated by session user. Production OAuth/webhook IP limits require a trusted ingress and `x-forwarded-for` mode.

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
| `npm run selfcheck:security-critical` | Check auth, request safety, privacy DTO, and audit invariants |
| `npm run selfcheck:notifications` | Check notification sources and privacy-safe copy |
| `npm run selfcheck:entitlement-webhook` | Check cycle-two entitlement and signed webhook policy |
| `npm run selfcheck:content-publication` | Check draft/review/publish/retire gates and participant query filters |
| `npm run selfcheck:product-analytics` | Check the privacy-safe MVP analytics envelope and exact event catalog |
| `npm run integration:two-user-mvp` | Run the synthetic two-user first-cycle flow against a local test replica set |
| `npm run integration:privacy-lifecycle` | Verify owner export and reversible deletion-request lifecycle |
| `npm run integration:release-database` | Verify DB races, notification ownership, and sandbox entitlement |
| `npm run integration:billing-ordering` | Verify stale/equivalent/conflicting webhook ordering and current subscription identity |
| `npm run integration:like-idempotency` | Verify intrinsic like replay/conflict/concurrency behavior |
| `npm run release:preflight` | Dry-run release data/index invariants |
| `npm run release:preflight:indexes` | Apply declared additive indexes after review |
| `npm run release:migrate-weekly-checkins` | Dry-run the weekly index migration; legacy upgrades require the separately approved drop command in the runbook |
| `npm run release:load-smoke` | Run guarded synthetic load/query smoke against a `_test` database |
| `npm run seed:questions` | Seed questionnaire data |

See `docs/RELEASE_RUNBOOK.md` for the ordered preflight, migration, verification, rollback, and first-production checklists.

## Project map

See `docs/PROJECT_MAP.md`.

## Working with Codex / agents

Start with `AGENTS.md` and `docs/INDEX.md`.
