# Changelog (Docs & Project Notes)

## 2026-02-05
- Initialized docs-as-primary-context workflow.
- Added rules for keeping docs and changelog in sync after changes.
- Added a docs map for quick navigation.
- Files: `AGENTS.md`, `docs/README.md`, `docs/CHANGELOG.md`

## 2026-02-05
- Fixed ESLint `no-explicit-any` errors in bulk answers API handler.
- Files: `src/app/api/answers/bulk/route.ts`, `docs/CHANGELOG.md`

## 2026-02-05
- Strengthened AGENTS rules for build blockers and pre-finish checks.
- Files: `AGENTS.md`, `docs/CHANGELOG.md`

## 2026-02-05
- Updated Next.js and React to patched versions to address Vercel security block.
- Files: `package.json`, `package-lock.json`, `docs/CHANGELOG.md`

## 2026-02-05
- Added a spinner loader while user/avatar data loads on the landing screen.
- Switched avatar images to `next/image` with remote patterns configured.
- Files: `src/app/page.tsx`, `src/components/profile/UserHeader.tsx`, `src/components/ui/Spinner.tsx`, `next.config.ts`, `docs/CHANGELOG.md`

## 2026-02-05
- Added JWT-based session cookie and secured questionnaire cards endpoint.
- Implemented server-side questionnaire cards DTO with batch status/progress aggregation.
- Updated questionnaires UI to use new DTO and card design.
- Added questionnaire cards UI/data-flow docs.
- Files: `src/lib/jwt.ts`, `src/app/api/exchange-code/route.ts`, `src/app/api/questionnaires/cards/route.ts`, `src/models/Questionnaire.ts`, `src/app/questionnaires/page.tsx`, `src/components/QuestionnaireCard.tsx`, `docs/ui/questionnaire-cards.md`, `docs/data/questionnaire-flow.md`, `docs/README.md`, `docs/CHANGELOG.md`
Date: 2026-02-05
Summary:
- Fixed questionnaire session narrowing to satisfy TypeScript for cards API.
Files: src/app/api/questionnaires/cards/route.ts

Date: 2026-02-05
Summary:
- Set session cookie SameSite/Secure to work inside Discord iframe in production.
Files: src/app/api/exchange-code/route.ts, docs/07-security-privacy.md

Date: 2026-02-05
Summary:
- Restored readable Russian text in questionnaire flow and UI docs.
Files: docs/data/questionnaire-flow.md, docs/ui/questionnaire-cards.md

Date: 2026-02-05
Summary:
- Restored readable Russian labels in questionnaire cards and list page UI.
Files: src/components/QuestionnaireCard.tsx, src/app/questionnaires/page.tsx

Date: 2026-02-05
Summary:
- Added GET /api/questionnaires/[id] to return questionnaire data.
Files: src/app/api/questionnaires/[id]/route.ts, docs/04-api-contracts.md

Date: 2026-02-05
Summary:
- Fixed GET handler signature for Next.js 15 params typing.
Files: src/app/api/questionnaires/[id]/route.ts

Date: 2026-02-05
Summary:
- Allow /api/questionnaires/[id] POST to accept single answer payload.
Files: src/app/api/questionnaires/[id]/route.ts, docs/04-api-contracts.md

Date: 2026-02-05
Summary:
- Remove any-typed route context for match card GET.
Files: src/app/api/match/card/[id]/route.ts

Date: 2026-02-05
Summary:
- Added facets/passports as-is inventory doc with evidence tables.
Files: docs/_inventory/facets-passports-as-is.md, docs/CHANGELOG.md

Date: 2026-02-05
Summary:
- Added questionnaire→vectors→profile expected-vs-as-is inventory report.
Files: docs/_inventory/questionnaire-vectors-profile-expected-vs-as-is.md, docs/CHANGELOG.md

Date: 2026-02-05
Summary:
- Updated pair questionnaire answer to use JWT user, idempotent upsert, and vector recalculation; refactored vector update helper and documented pair flow updating profile.
Files: src/utils/vectorUpdates.ts, src/app/api/answers/bulk/route.ts, src/app/api/questionnaires/[id]/route.ts, src/app/api/pairs/[id]/questionnaires/[qid]/answer/route.ts, docs/data/questionnaire-flow.md, docs/CHANGELOG.md

Date: 2026-02-05
Summary:
- Fixed pair questionnaire answer mapping to allow optional question _id with a safe type guard.
Files: src/app/api/pairs/[id]/questionnaires/[qid]/answer/route.ts, docs/CHANGELOG.md

Date: 2026-02-07
Summary:
- Added a dedicated `docs/problems/` registry separated from ADR and core docs.
- Added 16 starter PROB files for security, API contracts, state-machine guards, analytics, entitlements, UI/domain layering, and retention debt.
- Updated docs map with the new Problems section.
Files: docs/problems/README.md, docs/problems/PROB-001-client-userid-trust-in-api.md, docs/problems/PROB-002-fragmented-session-auth-adoption.md, docs/problems/PROB-003-missing-resource-authorization-guards.md, docs/problems/PROB-004-no-idempotency-layer-for-mutations.md, docs/problems/PROB-005-inconsistent-api-response-contracts.md, docs/problems/PROB-006-no-centralized-dto-layer.md, docs/problems/PROB-007-business-logic-inside-route-handlers.md, docs/problems/PROB-008-god-components-and-ui-api-coupling.md, docs/problems/PROB-009-duplicate-activity-suggestion-flows.md, docs/problems/PROB-010-legacy-relationship-activity-still-present.md, docs/problems/PROB-011-state-machine-guards-not-centralized.md, docs/problems/PROB-012-analytics-events-not-unified-and-auditable.md, docs/problems/PROB-013-entitlements-abstraction-not-implemented.md, docs/problems/PROB-014-missing-rate-limiting-and-abuse-controls.md, docs/problems/PROB-015-log-privacy-and-retention-policy-missing.md, docs/problems/PROB-016-no-cross-cutting-validation-layer-zod.md, docs/README.md, docs/CHANGELOG.md
