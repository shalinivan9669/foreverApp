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
