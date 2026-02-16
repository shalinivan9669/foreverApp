# UI Audit: React Best Practices (2026-02-15)

## Scope
- Reviewed `src/app/*`, `src/components/*`, and `src/features/*` against `docs/engineering/frontend-playbook.md`.
- Focused on: transport boundaries, DTO leakage in view layer, legacy state/orchestration patterns, and user-facing text integrity.

## Baseline Findings (Prioritized)
1. `High`: legacy transport logic in UI entrypoints.
- `src/app/questionnaire/page.tsx` used direct `fetch('/api/questions...')` + legacy submit transport.
- `src/components/OnboardingWizard.tsx` used direct `/.proxy/api/*` transport calls.
- `src/app/pair/[id]/diagnostics/page.tsx` and `src/app/pair/[id]/questionnaire/[qid]/page.tsx` used `fetchEnvelope`/`api` directly in page-level orchestration.
- `src/app/page.tsx` fetched Discord profile directly in page code.

2. `High`: user-facing mojibake in active UI.
- `src/features/pair/PairProfilePageClient.tsx`
- `src/components/OnboardingWizard.tsx`
- `src/components/QuestionnaireCard.tsx`
- `src/features/match/feed/MatchFeedView.tsx`

3. `Medium`: DTO types leaking into presentation components.
- Examples: `src/components/QuestionnaireCard.tsx`, `src/features/questionnaires/QuestionnairesPageView.tsx`, `src/features/match/feed/MatchFeedView.tsx`, `src/features/match/inbox/MatchInboxView.tsx`.

4. `Medium`: duplicated state/orchestration approaches.
- Parallel use of legacy `useUserStore` and newer `client/hooks` orchestration remains across screens.

## Fix Pass Executed
- Added typed transport coverage for legacy UI flows:
  - `src/client/api/discord.api.ts`
  - `src/client/api/questionnaires.api.ts` (random questions, bulk answers, target list, couple answer)
  - `src/client/api/pairs.api.ts` (diagnostics)
  - `src/client/api/users.api.ts` (profile upsert, onboarding patch)
  - `src/client/api/types.ts` (new typed request/response shapes)
- Added hook-based orchestration for legacy questionnaire quick-flow:
  - `src/client/hooks/useLegacyQuestionnaireQuickFlow.ts`
- Migrated pages/components away from direct transport usage:
  - `src/app/page.tsx`
  - `src/app/questionnaire/page.tsx`
  - `src/components/OnboardingWizard.tsx`
  - `src/app/pair/[id]/diagnostics/page.tsx`
  - `src/app/pair/[id]/questionnaire/[qid]/page.tsx`
- Standardized state blocks (loading/error/empty) to shared components in migrated legacy flows.
- Fixed user-facing mojibake in touched UI:
  - `src/features/pair/PairProfilePageClient.tsx`
  - `src/components/OnboardingWizard.tsx`
  - `src/components/QuestionnaireCard.tsx`
  - `src/features/match/feed/MatchFeedView.tsx`

## Residual Tech Debt
- View-level DTO coupling still exists in several flows not fully migrated in this pass.
- Mixed store/hook orchestration (`useUserStore` + `client/hooks`) remains; full consolidation should be handled as a dedicated migration.
- `docs/ui/questionnaire-cards.md` still has encoding defects and should be rewritten in clean UTF-8.
