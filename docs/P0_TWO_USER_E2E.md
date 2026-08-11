# Public MVP two-user manual E2E

Run on the exact release artifact with a transaction-capable pilot MongoDB and two fresh Discord accounts/sessions `A` and `B`. Use synthetic, non-sensitive answers. Never save request bodies, cookies, bearer tokens or invite tokens in evidence.

## Preparation

- Record environment, build SHA, browser/Discord versions and pseudonymous testers.
- Use independent sessions and verify neither account has an active/paused Pair.
- Confirm billing/entitlement is absent or disabled; do not grant either user a plan.
- Verify liveness/readiness and intended indexes before the flow.

## Auth, onboarding and invite

1. Both users sign in; refresh/re-entry restores the correct lifecycle step.
2. Both complete 18+/voluntary/privacy consent and explicit onboarding input.
3. Interrupt B midway, sign in again and confirm owner-only resume.
4. A creates an invite. Verify expiry/copy/reissue and that token is absent from query, browser storage and server logs.
5. Self-accept and third-user/reused/expired/cancelled attempts return a generic unavailable state and create no Pair.
6. B accepts from `/join#token=…`; one active Pair and two membership claims exist.
7. Same accept replay returns the same Pair; a concurrent competing invite cannot create a second Pair.

## Three free cycles

For three consecutive server-owned cycle keys, with no entitlement:

1. Cycle 1: A submits first. Fields must start untouched; submit is blocked until every mandatory field is explicitly selected. B sees only waiting, no pair signal/value/note.
2. B submits. Exactly one Factor-backed summary appears with at most four qualitative signals.
3. Offer an activity; accept it, start, submit A feedback then B feedback. Verify partial then final result and history.
4. Cycle 2: reverse order B → A. Replace the first offer once, accept replacement, complete separate feedback.
5. Cycle 3: exercise skip/recovery or another accepted action as the fixture permits, then complete the cycle/action path required by release evidence.
6. Repeat same-body and concurrent submit/offer/accept/feedback requests. Canonical evidence/snapshot/cycle/decision/activity counts must not duplicate.
7. Confirm no price, trial, purchase CTA, `402`, `PAYMENT_REQUIRED` or `ENTITLEMENT_REQUIRED` anywhere.

## Privacy and Factor disclosure

- Pair/user/activity/history/notification responses contain no peer raw input/note, exact Factor/delta/average, numeric confidence/evidence identity/count, internal fit/hash, SafetyGate or compatibility score.
- Owner profile shows semantic cards and explicit unavailable states, never six axes/radar/passport.
- Change local drafts/retry timing and verify no binary reconstruction of peer answers.
- A observer/pair answer must not change B's personal profile.
- Direct old diagnostics/insights/questions/answer-bulk and public `/api/match/**` paths are absent and cannot return legacy data.

## Recommendation, PairEvent, activity and safety

- Offer/replace/skip explanations are neutral and Factor-bound.
- Concurrent canonical/compatibility offer routes do not leave parallel visible/orphan offers.
- PairEvent is current-registry bound; accepted activities are bounded and contain no raw event source in participant DTO.
- Enable SafetyGate for A. Only A's offered-action visibility/acceptance narrows to neutral eligible actions. B's dashboard, Pair Summary, PairEvent, recommendation/activity current and history projections, timestamps and notifications remain exactly unchanged and reveal no setting/reason.
- Disable SafetyGate and verify owner state restoration without partner disclosure.

## PartnerSignal and help

- Create/edit a private daily signal draft; verify nothing is sent before explicit confirm.
- Confirm send once; B sees only the exact confirmed message. Same retry is idempotent; changed-content reuse conflicts.
- Audit contains no message text. Help renders catalog `help-ru-v1`, produces no partner notification and makes no diagnosis/emergency-response claim.

## Pair lifecycle

1. Pause and resume; new actions respect state while existing allowed recovery remains consistent.
2. Race Pair end against weekly/recommendation/activity/feedback calls. End wins terminally or the other mutation commits before end without reopening the Pair.
3. Verify old Pair id denies new reads/writes; open cycles/activities/decisions/events close, SafetyGate/signals/notifications clean up.
4. Create a new invite and reconnect A/B. New Pair id/context is different and contains no old private projection.

## Export, logout and deletion

- A export contains bounded owner data/allowed shared summaries and no B raw source/snapshot/note/SafetyGate reason.
- Logout A and verify old cookie/bearer replay fails.
- B creates then cancels a deletion request; data/session remains.
- On a dedicated disposable account/context, create request and explicitly confirm deletion. Verify old sessions fail, account/required artifacts disappear, Pair access closes and only pseudonymized request lifecycle remains.
- Race export versus deletion; neither may return partner data or falsely report success.

## Mobile/accessibility and recovery

- Repeat critical screens at 320, 360, 390 and 430 px; check overflow, safe area, on-screen keyboard, focus order and touch targets.
- Exercise loading/error/empty/retry, browser back and refresh on entry, invite, weekly, recommendation, activity, settings and deletion confirmations.
- Confirm no placeholder, mock, dead button, paywall, dating-first copy or mojibake.

## Evidence record

Record only pass/fail, timestamps, sanitized field-name lists, aggregate canonical counts and screenshots without private content. A local synthetic integration does not replace this real two-session gate.
