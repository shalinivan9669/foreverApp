# ForeverApp / «Вместе»: detailed MVP flows

Статус: active acceptance contract for [MVP_SPEC.md](./MVP_SPEC.md). Обновлено 2026-08-11.

## 1. Auth and session

Flow:

```text
Discord SDK code → server exchange/verified identity → versioned session
→ lifecycle redirect → refresh/re-entry restore
```

Acceptance:

- unauthenticated requests cannot read personal/pair data;
- redirect mismatch and auth failure are generic/retryable and create no duplicate account;
- client identifiers never override session subject;
- cookies/tokens are absent from storage/log/DTO;
- logout rotates server-side session version and clears cookie;
- an old cookie/bearer fails after logout or deletion.

## 2. Onboarding and semantic input

- 18+, voluntary participation and privacy acknowledgement are explicit.
- Closed typed answers start unset and can resume by owner revision.
- Optional sensitive input may be declined/unknown; it is not a neutral value.
- Reviewed measurement bindings create Factor evidence/snapshots with exact versions.
- Unmapped questionnaire content stays `UNMAPPED` and creates no invented Factor.
- Private input is not returned to the partner.

## 3. Invite and Pair creation

```text
[none] → ACTIVE invite → ACCEPTED | CANCELLED | EXPIRED
                         ↘ reissue: old cancelled + new ACTIVE
```

Acceptance:

- raw token is returned once, stored only as hash and carried outside query/server logs;
- self-accept, expired/cancelled/reused-by-other and membership conflicts return generic results;
- same accepter retry returns the same Pair;
- concurrent accepts create one active Pair/two claims;
- direct `/pairs/create` and match confirmation cannot form a Pair;
- member order has no semantic A/B meaning.

## 4. Weekly cycle

UI starts `closeness`, `fatigue`, `irritation`, `readiness` and the mandatory closed topic choice as untouched/null. Submit stays disabled until each mandatory answer is explicitly selected; a middle/neutral choice is valid only after user action. Note is optional owner-private text. Skip has its own confirmation and sends no reason.

Server acceptance:

- all numeric values are finite/in range and the closed choice is boolean;
- pair/session/member/cycle identity is server-derived;
- identity is one user + Pair + week; exact retries/concurrency converge;
- Factor evidence/snapshots are canonical and repairable after partial failure;
- future/not-started and expired cycles reject mutation;
- no entitlement/cycle count is consulted.

Pair result:

- no submit: `NOT_READY`;
- one valid submit: partial/`INSUFFICIENT_DATA`, no pair signals;
- two valid submits: one immutable Factor/evaluation-backed summary;
- symmetric signals are invariant to member order;
- expiry preserves an already-published safe result but incomplete expiry remains insufficient;
- retries or changing own client draft cannot reveal peer values.

## 5. Pair Summary

At most four qualitative signals cover current contact, tension, recovery and resource. They are a display projection, not stored user axes.

Allowed: neutral status, safe explanation, data status and one next step. Forbidden: raw/quoted answer, note, exact value/delta/average, numeric confidence/evidence count, compatibility/health score, diagnosis, motive inference or SafetyGate reason.

## 6. Recommendation decision

```text
current Factor snapshots/evaluations + context/current state
+ history/cooldown + contraindications + SafetyGate
→ one current action
```

Acceptance:

- a publishable current semantic result or a neutral fail-closed fallback is required;
- offer concurrency (including compatibility aliases) converges on canonical work;
- member can accept, skip or replace exactly once;
- expiry and interrupted replacement/accept recover on retry;
- acceptance links one activity and no duplicate effect;
- recommendation provenance pins registry/action/input versions/hashes;
- participant reason is neutral and hides internal rank, exact Factor and safety state;
- all decisions are free.

## 7. PairEvent

- Runtime candidates use pair lifecycle, calendar, bounded activity history or qualitative current weekly pair state.
- Each visible event is bound to current Factor registry version and allowed action targets.
- Diagnostics/raw weekly fields are not inputs or DTO output.
- Accept/decline/snooze are member/state/idempotency guarded.
- Accept creates only bounded Factor-bound activity offers, never reads either member's private SafetyGate, and reuses an existing source-bound offer on retry.
- Migration retires unsafe/invalid legacy events and refuses future-version conflicts.

## 8. Activity and feedback

```text
offered → accepted → in_progress → awaiting_feedback
→ completed_partial → completed_success/failed
```

- One participant's closed feedback yields a safe preliminary result.
- Peer sees only aggregate readiness/status, not exact answers.
- Late second feedback refines once; final replay creates no duplicate evidence/effect.
- Activity result creates semantic task/pair evidence and immutable snapshots.
- Reported subjective change is not presented as causal proof.
- Paused/ended state follows the documented resource policy; ended Pair cannot mutate.

## 9. History and notifications

- Pair history is cursor-paginated/hard bounded and contains only published derived cycle summaries, activity status and feedback-presence facts.
- Old results are not recomputed from raw data with new rules.
- Notifications are owner-scoped, deduplicated, cursor-paginated and neutral for invite/join/waiting/summary/action/feedback/cycle/end transitions.
- Neither feed contains raw answers/notes, exact Factor, topic, SafetyGate or internal ids/hashes.

## 10. Owner profile, settings and help

- Profile shows semantic cards grouped by domain/dimension, explicit missing/unknown/insufficient states and qualitative confidence/freshness bands; no six-axis radar, percentage, passport or generic growth label for non-skills.
- Settings exposes privacy/export, deletion request/cancel/confirm, SafetyGate, Pair pause/end and logout with confirmations.
- Help renders the versioned `help-ru-v1` catalog for weekly privacy, PartnerSignal, pair lifecycle, SafetyGate and crisis limitations without diagnosis or partner notification.
- Jurisdiction-specific resource copy remains behind expert/legal publication review.

## 11. PartnerSignal

```text
private daily draft → edit/preview → explicit confirm/send
→ one source-bound signal → receiver sees exact confirmed text → TTL expiry
```

No automatic inference/send. Retry with same text is idempotent; different text for an already-sent source conflicts. Audit contains no message text. Pair end removes pair-scoped signals.

## 12. SafetyGate

- owner-only boolean, no reason/free text;
- pair-scoped and revoked on end;
- only narrows the owner's offered-action visibility and acceptance eligibility;
- no Pair Summary/rank/compatibility effect;
- no PairEvent, current activity, history or other shared-state effect;
- no partner notification, error reason or binary inference;
- owner-local neutral fallback when active.

## 13. Pair end and reconnect

End requires explicit confirmation and is terminal:

- Pair becomes `ended`;
- membership claims release;
- open cycles expire, activities cancel, decisions/events expire;
- SafetyGate is revoked; pair-scoped signals/notifications are removed;
- old id denies future reads/writes;
- repeated/racing mutations cannot reopen it.

Reconnect starts through a new invite and creates a new Pair id/context. Old private pair projections are not copied.

## 14. Export and account deletion

- Export is owner-only and bounded; owner Factor/source data and allowed shared summaries are included, peer raw data is excluded.
- Create deletion request is idempotent and reversible until confirmation.
- Explicit `DELETE_ACCOUNT` confirmation revokes sessions, ends active Pair, executes cleanup transaction and clears cookie.
- Failure records `FAILED` and supports retry; success records a pseudonymous lifecycle marker.
- Export versus deletion and session replay races must fail safely.

## 15. Free-core and analytics

First, second, third and later cycles follow the same access policy. No checkout/provider/subscription is required and no price/trial/purchase CTA or payment error appears in core UI/API.

Analytics uses an exact allowlist of technical flow events and never includes user/pair id, input, note, PartnerSignal text, Factor/summary content or safety state.

## 16. Non-functional acceptance

- refresh/retry/back preserve recoverable state;
- all retryable writes are idempotent and multi-document transitions atomic/reconcilable;
- list reads are bounded and indexed;
- startup and core flow work without legacy vector/diagnostic collections;
- browser UI works at 320/360/390/430 px with no horizontal overflow and usable keyboard/focus/touch/safe area;
- no placeholder/mock/TODO/dead action/mojibake in active flow;
- full verification and independent review gates are recorded for the same tree.

## 17. Required acceptance scenarios

1. Invalid/missing answer never becomes `0.5`.
2. Untouched field is not an answer; explicit neutral is.
3. One submit is insufficient; two create one summary.
4. A/B reorder does not change symmetric evaluation.
5. A observation never mutates B profile.
6. Private note/SafetyGate/peer confidence/evidence cannot be inferred.
7. Registry/version mismatch fails closed; replay is deterministic.
8. Concurrent evidence creates no duplicate snapshot.
9. Legacy-only/invalid data creates no fabricated Factor; startup needs no legacy collection.
10. Recommendation/activity use Factor bindings only.
11. A pair without entitlement completes at least three full cycles.
12. End makes old Pair id useless; reconnect creates a new context.
13. History/notifications/export satisfy disclosure boundaries.
14. Deletion revokes old sessions and cleans required data.
15. Required automated, database, load, browser and review gates pass or remain explicitly external.
