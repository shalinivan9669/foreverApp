# ForeverApp / «Вместе»: public free MVP scope

Статус: canonical MVP scope. Обновлено 2026-08-13.

## 1. Проверяемая гипотеза

Сможет ли совершеннолетний пользователь найти потенциального партнёра через качественный consent-bound Factor Matching, сформировать Pair только после двухстороннего подтверждения и затем возвращаться к безопасному короткому циклу без раскрытия личных ответов?

```text
two consenting accounts → qualitative matching or invite → confirmed Pair → two personal check-ins
→ qualitative Pair Summary → one action → separate feedback → next free cycle
```

Недостаток данных, skip, expiry, one-sided completion и late feedback — штатные состояния.

## 2. MVP gates

### Code-complete core

- Discord auth/session and centralized resource guards;
- Factor Engine `NEW_ONLY`, immutable evidence/snapshots and no six-axis runtime;
- standalone MatchingProfile, preferences/use grants, discovery/feed grants, Like/connection/block and qualitative fit;
- personal onboarding and Pair creation by accepted invite or two-party-confirmed MatchingConnection;
- weekly untouched input, skip/expiry, semantic Pair Summary;
- Factor-based recommendation and activity feedback loop;
- free cycle 1, 2, 3 and all later cycles;
- history/notifications/profile/settings/help/SafetyGate;
- PartnerSignal;
- pause/resume/end/reconnect;
- export, destructive confirmed deletion and session revocation;
- idempotency, concurrency protection, migrations and privacy tests.

### Local release gate

- lint, typecheck, all selfchecks, agent diagnostics, production build, diff check and dependency audit;
- guarded database integrations including three free cycles, NEW_ONLY migrations, lifecycle, privacy and failure/concurrency scenarios;
- two comparable load runs satisfying required dashboard/history/recommendation p95 targets with no duplicates/errors;
- supported-browser mobile-width/accessibility smoke;
- independent architecture, privacy/security and release/performance review.

Current evidence and any still-running checks are recorded in [MVP_RELEASE_STATUS.md](./MVP_RELEASE_STATUS.md), never inferred from this scope document.

### External production gate

- two fresh real Discord accounts/sessions complete [P0_TWO_USER_E2E.md](./P0_TWO_USER_E2E.md);
- production replica set, indexes, secrets, least privilege, backup/restore and rollback are verified;
- alerts/on-call/privacy incident process have named owners;
- sensitive Russian content and jurisdiction-specific help/retention terms receive expert/legal approval;
- controlled deployment and go/no-go are authorized.

No payment, subscription, provider or entitlement gate belongs to this MVP.

## 3. Functional scope

| Area | Required result |
| --- | --- |
| Auth | Repeatable Discord entry, cookie/bearer restore, server-side logout revocation |
| Onboarding | Resume, consent, explicit closed input, semantic evidence where bound |
| Matching | Standalone profile, explicit Factor-use grants/preferences, bounded feed/card grants, qualitative fit, Like/response, connection/block and two-party confirmation; free, no numeric score/raw values |
| Pair | Hash-only invite or confirmed MatchingConnection, one active membership claim with source provenance |
| Cycle | Independent explicit submit/skip, server UTC window, concurrency-safe canonical result |
| Summary | Up to four qualitative non-reconstructable signals; insufficient is valid |
| Recommendation | One Factor-bound decision, accept/replace once/skip/expire/recovery |
| Activity | Start, separate feedback, partial/final result, new Factor evidence |
| Profile | Owner semantic cards, no radar/axis/value/compatibility score |
| History/notifications | Bounded/cursor-paginated derived records with neutral copy |
| Safety/help | Owner-private eligibility veto and versioned private `help-ru-v1` catalog |
| PartnerSignal | Private draft, explicit confirm/send, unique source binding and TTL |
| Lifecycle | Pause/resume/end, old-id denial and new Pair reconnect |
| Privacy | Bounded export, deletion request/cancel/execute, session revocation |
| Operations | Versioned publication/registry, guarded migrations, preflight, load/review evidence |

## 4. Screen map

1. Discord entry/error/retry.
2. Personal onboarding.
3. Matching card/preferences, bounded candidate feed/detail, Like/inbox/connection/block and Pair confirmation.
4. Invite/create/join/waiting/expired/cancel/reissue.
5. Main Pair/cycle hub.
6. Weekly explicit check-in and skip confirmation.
7. Pair Summary and recommendation decision.
8. Activity/start/feedback/partial/final/history.
9. Owner semantic profile and personal today.
10. Settings/privacy/SafetyGate/help/end/reconnect/export/delete/logout.

Every active screen needs loading, error, empty and retry behavior where applicable; no placeholder, mock, dead CTA, paywall, legacy score or diagnostic primary copy.

## 5. Non-negotiable invariants

- Session identity and resource guard precede business state access.
- No raw Mongoose document crosses API.
- Missing/invalid/unknown/insufficient is never a numeric neutral.
- A/B order does not change symmetric evaluation.
- A observation does not mutate B profile.
- One-sided data never reveals a pair signal.
- No participant endpoint exposes peer raw data, exact Factor internals or SafetyGate.
- Candidate feed/detail exposes only qualitative fit; candidate grants authorize a pinned presentation but never replace the authenticated session actor.
- Like/connection/block mutations derive actor and role from session; one-sided confirmation cannot create a Pair.
- Published versions/snapshots are immutable and replayable.
- Runtime starts without legacy vector/diagnostics collections and has no fallback.
- No core mutation consults paid entitlement.
- Ended Pair ids cannot be reused; reconnect is a new context.
- Destructive deletion revokes sessions and reports failure honestly.

## 6. Definition of Done

The MVP is locally complete only when implementation, applicable automated/database/load/browser checks and three independent reviews are green for the same tree. It is publicly deployed only after the external production gate is separately recorded. A green build alone is not completion.
