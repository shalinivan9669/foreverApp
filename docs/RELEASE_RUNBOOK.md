# Release and operations runbook

Status: active procedure for the public-free NEW_ONLY artifact. Local evidence is not deployment authority.

## 0. Release principles

- Core billing is disabled/non-gating; do not configure a paywall or entitlement as part of release.
- Production runtime must be `NEW_ONLY`. Do not deploy a dual-read/legacy-vector fallback or roll back to one.
- All data-changing migration modes require target-specific review, a current verified restore and a write-stopped maintenance window.
- Dry-run/apply output may record counts, reason codes and index names only—never ids, raw answers, notes, tokens or duplicate key values.
- `*_test` and local-URI guards must never be bypassed. A test-only migration harness is not production authorization.

## 1. Environment

Required: `MONGODB_URI`, `JWT_SECRET` (32+ characters), `NEXT_PUBLIC_DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and one of `DISCORD_REDIRECT_URI` / `NEXT_PUBLIC_DISCORD_REDIRECT_URI`.

Optional:

- `TRUSTED_PROXY_MODE=disabled|x-forwarded-for`; enable forwarded IP only behind validating ingress.
- `BILLING_MODE=disabled|sandbox`; keep `disabled` for public-free core.
- `BILLING_WEBHOOK_SECRET` only for isolated sandbox tests.
- `ENTITLEMENTS_ADMIN_KEY` only for protected legacy/admin infrastructure.

`/api/health/live` reveals liveness only. `/api/health/ready` validates config and bounded Mongo ping without diagnostic details.

## 2. Exact-tree verification

Before the maintenance window, record build SHA/operator/environment and run serially:

```text
npm run lint
npm run check:types
npm run check:self
npm run check:agents
npm run build
git diff --check
npm audit --omit=dev
```

On disposable local replica-set databases run every applicable integration in [TESTING.md](./TESTING.md), including Factor runtime/cutover, onboarding/questionnaire, PairEvent, Pair lifecycle, PartnerSignal, privacy/export/deletion, three-cycle two-user, reliability and two comparable load runs. Preserve the exact deploy artifact and a NEW_ONLY-compatible rollback artifact.

Complete independent architecture, privacy/security and release/performance reviews. Fix confirmed findings and repeat impacted gates.

## 3. Read-only target preflight

Against the exact target/restore, before writes:

```text
npm run release:preflight
npm run release:migrate-factor-engine
npm run release:migrate-pair-events-new-only
npm run release:migrate-pair-context-index
npm run release:migrate-partner-signals
npm run release:migrate-privacy-requests-v2
npm run release:migrate-weekly-checkins
```

Review:

- current canonical registry presence/hash and Factor source replay eligibility/unreplayable reasons;
- duplicate canonical identities and missing/extra indexes;
- legacy Pair `{ key: 1 }` unique index that blocks reconnect contexts;
- legacy weekly `{ userId, weekKey }` unique index that blocks solo + Pair rows;
- unsafe/mixed/future-version PairEvents;
- legacy privacy request shapes/indexes;
- PartnerSignal invalid ids/expiry/duplicates.

Any future-version conflict, invalid identity, duplicate unique group, unknown index shape or environment mismatch blocks release. Resolve by explicit data decision; never invent Factor values.

## 4. Backup and maintenance window

1. Stop writes.
2. Create an encrypted named backup and restore it into an isolated database.
3. Run all dry-runs and relevant apply commands on the restore first.
4. Verify counts, indexes, transaction support, readiness and a controlled idempotent flow on the restore.
5. Record backup age, restore duration/outcome, operator and rollback artifact without sensitive payload.
6. Only then apply to the intended database using separately approved commands below.

## 5. Guarded migration commands

### Factor registry/evidence/snapshots

Dry-run: `npm run release:migrate-factor-engine`.

Apply only after reviewing replay/unreplayable/index counts:

```powershell
$env:FACTOR_ENGINE_MIGRATION_CONFIRM='APPLY_NEW_ONLY_FACTOR_MIGRATION'
npm run release:migrate-factor-engine -- --apply --mode=NEW_ONLY
```

It captures one immutable `asOf`, seeds the immutable registry, reconciles Factor indexes and replays only raw onboarding/weekly sources whose observed and recorded times are within that cutoff. Replay markers pin the exact source reference and source times. It never converts aggregate axes. Rerun dry-run; it must be idempotent and registry hash must match.

### PairEvent NEW_ONLY

```powershell
$env:PAIR_EVENT_NEW_ONLY_MIGRATION_CONFIRM='APPLY_NEW_ONLY_PAIR_EVENT_MIGRATION'
npm run release:migrate-pair-events-new-only -- --apply --mode=NEW_ONLY
```

It binds safe semantic events, scrubs legacy residue and retires unsafe/invalid events. Future-version conflicts refuse apply. Rerun dry-run and integration.

### Pair questionnaire integrity

Preflight: `npm run release:preflight:pair-questionnaires`.

After reviewing the report on a restored target, create only the additive canonical indexes with `npm run release:migrate-pair-questionnaires`. The command refuses to apply if it finds more than one `in_progress` session for a `{pairId, questionnaireId}`, duplicate `{sessionId, questionId, by}` answers, or a conflicting canonical index. It never chooses, deletes or rewrites duplicate source rows: stop, investigate ownership/history, and use a separately reviewed data-resolution plan. Rerun the preflight and `npm run integration:pair-questionnaire-concurrency` after apply.

### Pair reconnect context index

Dry-run: `npm run release:migrate-pair-context-index`.

Fresh target (no legacy unique):

```text
npm run release:migrate-pair-context-index -- --apply-additive-indexes
```

Upgrade target with reviewed legacy `{ key: 1 }` uniqueness:

```text
npm run release:migrate-pair-context-index -- --apply-additive-indexes --drop-legacy-unique
```

The drop flag is destructive/rollback-sensitive. Every rolling/rollback artifact must understand multiple historical Pair contexts.

### Weekly pair scope

Dry-run: `npm run release:migrate-weekly-checkins`.

Fresh target: `npm run release:migrate-weekly-checkins -- --apply-additive-indexes`.

Upgrade target with reviewed old uniqueness:

```text
npm run release:migrate-weekly-checkins -- --apply-additive-indexes --drop-legacy-unique
```

After the old index is dropped, never roll back to code that assumes `{ userId, weekKey }` is globally unique.

### Privacy requests v2

```powershell
$env:PRIVACY_REQUEST_MIGRATION_CONFIRM='APPLY_PRIVACY_REQUEST_V2_MIGRATION'
$env:JWT_SECRET='<target secret, not logged>'
npm run release:migrate-privacy-requests-v2 -- --apply --mode=PRIVACY_V2
```

Review state mapping and exact legacy-index drop on the restore first.

### PartnerSignal

The current script is deliberately restricted to `mongodb://127.0.0.1:27018`, `directConnection=true` and a `_test` database. It can prove normalization/deduplication/TTL behavior on a restored synthetic fixture, including its explicit `PARTNER_SIGNAL_MIGRATION_CONFIRM`, but must not be bypassed for production. A fresh target needs only declared additive indexes. If production contains legacy PartnerSignal drift/duplicates, stop and approve a target-specific reviewed migration because apply may delete duplicate documents.

### Remaining additive indexes

After specialized migrations:

```text
npm run release:preflight:indexes
npm run release:preflight
```

Preflight must report zero blocking invariants and no missing/extra declared index drift for the exact target. Any undeclared index blocks additive index application until it is explicitly reviewed and reconciled.

## 6. Recorded local migration evidence

On a truly fresh `_test` fixture, Factor migration seeded registry v6 and applied 28 Factor indexes; general additive preflight applied 97 remaining declared indexes. Final result was `missing=0`, `extra=0`, with 72 blocking invariants green.

Fresh Pair-context dry-run found `legacyUnique=0` and one canonical lookup. A separate legacy-index fixture was blocked by `legacy-pair-key-unique-index`; explicit reviewed removal made preflight pass. This is local script evidence only.

## 7. Deploy and smoke

While writes remain stopped:

1. Deploy the exact verified NEW_ONLY artifact.
2. Rerun dry-run preflight/migrations and confirm intended indexes/registry hash.
3. Verify live/ready, unauthenticated private denial, correlation id, cache headers and exact `/.proxy/api/...` transport.
4. Request two documents: CSP nonce must differ and every Next script must use the matching nonce; API JSON remains unaffected.
5. Complete supported-browser 320/360/390/430 smoke and real two-session Discord checklist.
6. Verify free cycle access with no entitlement; any payment-required core response is rollback-worthy.
7. Prove alert delivery, backup recency, incident owner and rollback compatibility before resuming traffic.

## 8. Rollback

- Roll back only to an artifact that understands Factor collections, pair-context and weekly scoped indexes, privacy request v2 and session versions.
- Leave additive fields/indexes in place. Do not delete evidence/idempotency records or restore legacy vector scoring to reduce errors/latency.
- Retry unknown outcomes with the same idempotency key/body; changed-body reuse remains conflict.
- If a migration changed a destructive uniqueness rule, an older incompatible build is not a valid rollback. Stop the affected mutation and deploy a compatibility patch.
- Disable the smallest failing boundary; never bypass membership, disclosure, version or canonical uniqueness checks.

## 9. Incident checklist

1. Stop the smallest affected writer/traffic slice and preserve evidence.
2. Record build/time/route group/error code/aggregate count only.
3. Check readiness, topology, pool, replication, slow ops, migration/index state, retry/lease/single-flight/reconciliation metrics.
4. Treat any cross-pair read, private disclosure, duplicate canonical registry/evidence/snapshot/cycle/decision/activity/notification or lost committed mutation as critical.
5. Resume using the persisted phase/idempotency identity; do not hand-edit answers/snapshots.
6. For deletion/session incidents, revoke access first, preserve minimal pseudonymous forensics and involve privacy/legal owner without sending sensitive detail to a partner.

## 10. External launch and first production

Before traffic: production secrets/least privilege, replica set, restore evidence, indexes, on-call/alerts, reviewed sensitive help/content/retention terms, real Discord E2E and explicit go/no-go.

First hour: watch p50/p95/p99, 5xx, pool/saturation, single-flight waits, conflicts/takeovers/reconciliation, free-core payment-error counter (must be zero), privacy alerts and canonical duplicate alarms.

First 24 hours: verify backup/TTL/alert delivery and record sanitized capacity evidence. Local load results in [SCALE_READINESS.md](./SCALE_READINESS.md) are a comparison baseline, not a promise.
