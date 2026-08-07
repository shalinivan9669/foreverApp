# AGENTS

## Project Snapshot
- Stack: Next.js App Router, React, TypeScript, MongoDB/Mongoose, Discord Embedded App SDK, Zod, custom session cookie auth.
- Product logic: Discord embedded relationship app for matching users, pair formation, questionnaires, activity offers, pair activities, check-ins, entitlements, and audit events.
- Frontend: `src/app/**` pages, `src/features/**` feature views, `src/components/**` shared UI, `src/client/hooks/**` orchestration hooks.
- API routes: `src/app/api/**/route.ts`.
- Domain services: `src/domain/services/**`.
- State machines: `src/domain/state/**`.
- Mongoose models: `src/models/**`.
- DTO mapping: `src/lib/dto/**`.
- Auth/session/resource guards: `src/lib/auth/**`.
- API helpers: `src/lib/api/**`.
- Docs: start at `docs/INDEX.md`; detailed historical docs remain under `docs/01-*`, `docs/ADR`, `docs/problems`, and `docs/engineering`.

## Navigation First
Before changing files, open:
1. `docs/INDEX.md`
2. the nearest `AGENTS.md` in the working directory
3. only the relevant code/docs for the task

Do not read or scan the whole repository unless the task explicitly asks for an architecture audit, migration, or broad refactor.

## Task Classification
Before editing, classify the task into exactly one operating mode:
- `DOCS_ONLY`
- `SMALL_FIX`
- `FEATURE_CHANGE`
- `SECURITY_FIX`
- `API_CONTRACT_CHANGE`
- `MODEL_SCHEMA_CHANGE`
- `BROAD_REFACTOR`

Use `docs/AGENT_OPERATING_MODES.md` for mode-specific read-first docs, edit scope, checks, stop conditions, and final report fields. Use `docs/TASK_PACKS.md` before manually browsing docs.

## Context Budget
- Do not inspect more than 12 source files before producing a plan.
- Do not inspect more than 5 docs before producing a plan.
- Do not scan the whole repository unless the task explicitly asks for broad audit/refactor.
- Do not read generated folders: `.next`, `node_modules`, coverage, build output.
- If more files are needed, report why before expanding scope.

See `docs/CONTEXT_BUDGET.md`.

## Architecture Boundaries
- API route handlers in `src/app/api/**/route.ts` must stay thin.
- Business logic belongs in `src/domain/services/**` or `src/domain/state/**`.
- DTO mapping belongs in `src/lib/dto/**`.
- Auth/session checks must use centralized guards from `src/lib/auth/**`.
- Resource ownership must use resource guards.
- Client UI must not depend on raw DB shape.
- UI transport should go through `src/client/api/**` when an API client already exists for the flow.
- API routes must not return raw Mongoose documents.
- Never trust `userId`, `fromId`, or `actorId` from query/body/path as the access subject when session is available.
- Models must not import UI/client code.
- Domain code must not import React, components, or browser APIs.

## Safety Rules
- Never log tokens, cookies, authorization headers, raw request bodies, answers, secrets, or full questionnaire/check-in payloads.
- Do not add production dependencies without an explicit reason.
- Do not change the env contract without updating `README.md` and relevant docs.
- Do not mix broad refactors with a feature/fix task.
- Do not change public API contracts without updating `docs/API_CONTRACTS.md`.
- Do not introduce `any` or `unknown` in code without explicit, justified typing.
- Fix `@typescript-eslint/no-explicit-any` violations with proper types, not rule suppression.
- Follow `next/next/no-img-element` where active; use `next/image` when the rule blocks builds.
- Preserve readable user-facing Russian text; do not introduce mojibake.
- Do not add `.agent-checks.allowlist.json` entries silently. Mention every new entry in the final report.

## Stop Conditions
Stop and ask for explicit approval if:
- a new production dependency is needed;
- DB migration or destructive change is needed;
- auth/session/security model changes;
- public API contract changes;
- generated files or lockfiles change unexpectedly;
- command output suggests environment/config mismatch;
- the task requires a product/business decision rather than an engineering decision.

## Edit Scope
- There is no numeric limit on the number of files that may be edited.
- Edit only the files required to complete the requested task coherently, and preserve unrelated user changes.
- File count alone is never a stop condition. Stop when the work crosses another listed boundary, such as a broad refactor, migration, security-model change, public API decision, or unclear product behavior.

## Verification Rules
- Docs only: manually verify links, paths, and structure. No build required.
- Frontend changes: run lint and targeted typecheck/build when available and relevant.
- Client API/hooks: run typecheck and inspect targeted usage.
- API/domain changes: run typecheck plus relevant selfcheck/tests.
- Auth/security changes: add or update targeted tests/selfcheck, or explain the manual security reasoning.
- Model/schema changes: check indexes, DTO exposure, and migration/backward compatibility.
- Broad or risky changes: lint, typecheck, build, and relevant selfchecks.

Do not always run the full suite. Choose checks by blast radius and explain skipped checks.

## Documentation Rules
- `docs/` is the primary project context.
- After meaningful code, behavior, architecture, or documentation changes, update relevant docs.
- Always append a short note to `docs/CHANGELOG.md`.
- If no suitable doc exists, create one under `docs/` and note it in the changelog.

## Review Checklist
Use `docs/CODE_REVIEW.md` for review tasks and before finishing risky work.

## Output Discipline
Final answers must use this compact format:

```md
## Change classification
- Type:
- Risk:
- Public API changed: yes/no
- DB schema changed: yes/no
- Security-sensitive: yes/no

## Summary
- max 5 bullets

## Changed files
- `path` - short reason

## Checks run
- `command` - passed/failed

## Not run
- `command` - reason

## Risks / follow-ups
- max 5 bullets
```

Do not paste large logs. If a command fails, show only the relevant 20-40 lines or summarize the failure precisely.
