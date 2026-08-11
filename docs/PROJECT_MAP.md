# Project Map

| Path | Purpose | Boundary |
| --- | --- | --- |
| `src/app/**/page.tsx` | Next App Router screens | Render view state; no database access |
| `src/app/api/**/route.ts` | HTTP boundary | Session/resource guard, validation, service call, DTO/envelope |
| `src/client/api/**` | Browser transport | Preferred HTTP access from UI |
| `src/client/hooks/**` | Client orchestration | Loading/error/retry and flow coordination |
| `src/client/viewmodels/**` | DTO-to-view mapping | No raw persistence shapes |
| `src/client/content/**` | Versioned participant-facing content catalogs | Typed, validated copy; publication review remains external |
| `src/components/**`, `src/features/**` | Shared and feature UI | No domain persistence side effects |
| `src/domain/model/definitions/**` | Versioned domain/dimension/factor/measurement/instrument/action registry | Canonical semantic definitions |
| `src/domain/model/values/**` | Typed Factor values and unavailable states | Never coerce missing/invalid data to a midpoint |
| `src/domain/model/evidence/**` | Evidence validation/provenance | Immutable, privacy-scoped events |
| `src/domain/model/snapshots/**` | Immutable personal/pair/evaluation snapshots and replay | Version/hash pinned |
| `src/domain/model/pair/**` | Ten deterministic pair strategies | Typed configs and reason codes |
| `src/domain/model/privacy/**` | Central Factor disclosure | Audience/consent-aware projection |
| `src/domain/model/recommendations/**` | Pure action eligibility/ranking | Internal priority only |
| `src/domain/services/**` | Stateful business use cases | Own transactions, persistence and orchestration |
| `src/domain/state/**` | Transition machines | Reject forbidden transitions with domain errors |
| `src/lib/auth/**` | Session and resource guards | Session subject is authoritative |
| `src/lib/api/**` | Parsing and response helpers | Strict JSON/body/origin/envelope rules |
| `src/lib/dto/**` | Participant/owner DTOs | Privacy-safe boundary; no Mongoose documents |
| `src/lib/audit/**` | Sanitized operational audit | No raw answers, notes or secrets |
| `src/lib/idempotency/**` | Retry-safe mutation leases/replay | Request hash and owner scope |
| `src/lib/abuse/**` | Mongo-backed rate limits | Abuse control, not monetization |
| `src/lib/entitlements/**` | Isolated future billing compatibility | Must not gate public core flow |
| `src/models/**` | Mongoose schemas/index declarations | Review DTO exposure and migration compatibility |
| `scripts/**` | Selfchecks, integrations, migrations and release utilities | Guarded commands; dry-run before apply |
| `docs/**` | Active contracts and historical context | Start at `docs/INDEX.md` |

Removed active-runtime areas include `src/domain/vectors/**`, `vectorScoring.service.ts`, `pairDiagnostics.service.ts`, `VectorSnapshot`, AxisRadar, diagnostics/insights routes and public legacy `/api/match/**` routes. References to them belong only in migration guards, retained-data cleanup or historical documentation.
