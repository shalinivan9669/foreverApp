# Agent Operating Modes

Codex must classify every task into exactly one mode before editing.

| Mode | Read first | Allowed edit areas | Required checks | Stop conditions | Required final report fields |
| --- | --- | --- | --- | --- | --- |
| `DOCS_ONLY` | `docs/INDEX.md`, `docs/TASK_PACKS.md`, `docs/DOCS_STATUS.md` | `docs/**`, `README.md`, `AGENTS.md`, `.codex/**` | manual links/paths, `npm run check:agents:changed` if scripts changed | stale doc ambiguity, product decision | change classification, summary, changed files, checks, not run, risks |
| `SMALL_FIX` | `docs/INDEX.md`, nearest `AGENTS.md`, relevant task pack | directly affected code/docs only | targeted check, `npm run check:agents:changed`, typecheck if TS touched | scope is no longer a small fix, public API/schema/security model impact | change classification with risk, concise security impact if relevant |
| `FEATURE_CHANGE` | `docs/INDEX.md`, `docs/ARCHITECTURE.md`, relevant task pack | feature UI/hooks/API/domain for one flow | typecheck, targeted selfcheck/test, agent checks | broad refactor, unclear product behavior | classification, user-visible behavior, checks, risks |
| `SECURITY_FIX` | `docs/SECURITY.md`, `docs/API_CONTRACTS.md`, relevant task pack | auth guards, resource guards, DTO/audit/rate-limit affected code | typecheck, targeted security/selfcheck, `npm run check:agents` | auth model change, new secret/env, unclear access policy | classification, security impact, checks, residual risk |
| `API_CONTRACT_CHANGE` | `docs/API_CONTRACTS.md`, `docs/SECURITY.md`, task pack | route/client API/DTO/docs for one contract | typecheck, targeted client/server check, agent checks | public contract compatibility decision | classification, contract changed yes, compatibility notes |
| `MODEL_SCHEMA_CHANGE` | `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/API_CONTRACTS.md` | `src/models/**`, DTO, targeted routes/services/docs | typecheck, DTO exposure review, migration/backward compatibility note | migration/destructive change, index uncertainty, PII decision | classification, DB schema changed yes, migration risk |
| `BROAD_REFACTOR` | `docs/INDEX.md`, `docs/ARCHITECTURE.md`, `docs/CODE_REVIEW.md` | only approved scope | lint, typecheck, build, relevant selfchecks, agent checks | always requires explicit approval before edits | classification, scope, checks, risks, follow-ups |

Default to the narrowest mode that can complete the task.

There is no numeric file-count limit for any mode. Reclassify or stop based on the nature and risk of the work, not on how many files a coherent implementation requires.

