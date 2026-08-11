# P0 capability matrix

Status: local implementation/evidence matrix for the public-free NEW_ONLY MVP. External production evidence is listed separately.

| Capability | Implementation evidence | Verification evidence | Status |
| --- | --- | --- | --- |
| Semantic Factor Core | `src/domain/model/**`, five Factor persistence models | `selfcheck:factor-engine`, Factor runtime/cutover integrations | DONE locally |
| Legacy cutover | Removed vector/diagnostics models/services/routes/UI and public `/api/match/**`; guarded raw-source migrations | `selfcheck:legacy-cutover`, participant-disclosure, cutover/questionnaire/PairEvent integrations | DONE locally |
| Onboarding and owner profile | `mvpOnboarding`, onboarding Factor runtime, semantic profile DTO/service | onboarding/profile selfchecks and integration | DONE locally |
| Invite-only Pair | hash-only invite, membership claim, transactional accept | pair-invite and two-user concurrency evidence | DONE locally |
| Weekly/Pair Summary | untouched UI, explicit submit/skip, Factor materialization, qualitative disclosure | weekly selfchecks and three-cycle E2E | DONE locally |
| Recommendation/activity | Factor-bound decision/action, one replacement, separate feedback evidence | decision/activity selfchecks, runtime and load races | DONE locally |
| Free core | no entitlement gate/paywall in core routes/UI | legacy-cutover plus three cycles without entitlement | DONE locally |
| PairEvent | Factor registry/action binding and guarded legacy retirement | PairEvent selfcheck/integration | DONE locally |
| History/notifications | bounded derived feeds and neutral DTOs | history/notification selfchecks, E2E/load | DONE locally |
| PartnerSignal | explicit confirm, source uniqueness, TTL, text-free audit | partner-signal integration | DONE locally |
| Safety/help | owner-private veto and versioned private `help-ru-v1` catalog | safety/security and participant-disclosure checks; catalog validation | DONE locally / review external |
| End/reconnect | terminal transactional cleanup, old-id denial, new context | pair-context lifecycle integration | DONE locally |
| Export/delete/session | bounded owner export, two-step destructive deletion, version revocation | privacy integrations | DONE locally |
| Scale foundation | indexes/bounds/single-flight/CAS and two comparable load runs | targets green, zero errors/duplicates; guarded replica-set reliability/reconciliation passed | DONE locally |

## External gates

| Gate | Required evidence | Status |
| --- | --- | --- |
| Real Discord | Two fresh accounts and independent signed sessions complete `P0_TWO_USER_E2E.md` | PENDING external |
| Production data/ops | Target replica set, exact indexes, backup restore, rollback and alert delivery | PENDING external |
| Content/privacy approval | Sensitive Russian copy, generic/jurisdiction help resources and deletion/retention terms reviewed | PENDING external |
| Deployment | Exact artifact, controlled rollout, first-hour/day monitoring and go/no-go owner | PENDING authorization |

Local synthetic evidence validates repository behavior, not Discord, production infrastructure, legal approval or capacity at real traffic.
