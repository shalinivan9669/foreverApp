# Current pilot handoff

Status: historical pilot handoff before the FEATURE_CHANGE implementation of 2026-09-05. The current scope and evidence are in [PRODUCT_IMPLEMENTATION.md](PRODUCT_IMPLEMENTATION.md), with [entry and reciprocal pairing](ENTRY_AND_PAIRING_UPDATE.md). The observations and next-step proposals below are retained as a dated baseline: first-entry work is now implemented; no database reset has been executed, and account-deletion recovery is deferred by the owner.

This document separates repository facts, observed pilot behavior, agreed product direction, and work that has not happened yet. It is not release approval and it must not be used as evidence that a deployment, environment change, backup, migration, or database reset succeeded.

## Repository baseline

- Before this documentation-only update, local `main`, `origin/main`, and `HEAD` all resolved to commit `70ad601` (`restore tile menu and recover weekly cycles`).
- The relevant implementation commits are `3dfed4e`, `6db203c`, and `70ad601`.
- The repository history contains no later implementation commit and no database-reset artifact.
- A commit being present on `main` does not, by itself, prove which Vercel deployment is serving traffic. Deployment SHA, environment values, Atlas indexes, and readiness must be verified separately and without recording secrets.

## Completed stabilization work present on `main`

| Area | Completed behavior | Verification retained in the repository | Residual operational requirement |
| --- | --- | --- | --- |
| Discord Activity request boundary | The exact configured `https://<clientId>.discordsays.com` Activity origin is accepted for the OAuth exchange and later cookie-authenticated mutations. Sibling, suffix, wildcard, and explicit cross-site origins still fail closed. | Security selfcheck coverage in `scripts/security-critical.selfcheck.ts`; active rules in `docs/SECURITY.md` and `docs/API_CONTRACTS.md`. | Re-run with two real Discord sessions against the exact deployed SHA. |
| Discord token exchange | The server-side exchange matches the Embedded SDK flow and no longer sends the unused `redirect_uri` field to Discord. | Focused OAuth regression coverage and changelog entry in commit `3dfed4e`. | Keep Discord application origins and the configured client id aligned. Never log codes or tokens. |
| First-login user creation | A Discord identity upsert no longer injects invalid legacy onboarding defaults into a partial `User` update, while Mongoose validation remains enabled. | Focused first-login regression coverage in commit `6db203c`. | A successful pilot login is useful manual evidence, but it is not the complete two-user acceptance gate. |
| Main menu | The five-tile presentation was restored without removing current cycle, recommendation, notification, retry, profile, questionnaire, Pair activity, or Factor Matching navigation. | Frontend selfcheck coverage in commit `70ad601`. | Repeat the authenticated mobile/Discord smoke on the deployed artifact. |
| Expired weekly-cycle recovery | The named-index query remains primary. Only the exact Mongo missing-hint failure receives one bounded retry without the hint. | Behavioral weekly-cycle selfcheck coverage in commit `70ad601`. | Restore and verify the declared production index; the fallback is recovery behavior, not the desired steady state. |

## Pilot evidence and its limits

- A real user subsequently reported that Discord login succeeded after the initial exchange failures. This is a single manual observation, not a completed Discord release gate.
- No repository evidence proves that Vercel environment variables were changed or fully revalidated during this incident response. Do not infer environment completeness from an open settings page.
- No current backup/restore result, Atlas index inventory, or immutable deployment SHA was recorded as part of this work.
- No two-user invite, Matching, Pair-formation, or three-cycle production run was completed in this work stream.

## First-time user flow: current implementation

The following is an audited description of the current code, not the agreed target behavior:

1. Discord OAuth creates or updates the verified Discord identity.
2. Every new user enters the same `mvp-onboarding-v2` flow.
3. The current UI leads through 12 configured questions even though one screen still says “10 questions”.
4. The user chooses an answer-use policy for every saved answer: owner-private, Pair-model-only, or shared.
5. Completion opens the same main menu for every user.
6. The active runtime primarily distinguishes users by whether an active/paused `Pair` exists; it does not currently ask for an authoritative first-entry choice between “single/seeking” and “already in a relationship”.
7. A pairless user is offered partner invitation and can also see Factor Matching navigation. An active Pair is rejected by the Matching backend, but the menu presentation does not fully express the intended cohort split.

Additional audited gaps:

- A truly fresh account has no complete active UI path for its own age, city, and location, although Matching discovery requires those values.
- The onboarding copy says privacy choices can be revisited, but no active UI/service flow currently reopens a completed onboarding session to change them.
- Pair invitation is consented by link creation from user A and explicit acceptance by user B; there is no separate third confirmation from A after B accepts.

## Agreed target first-entry split

The product direction confirmed during the pilot discussion is:

| Declared cohort at first entry | Primary path | Partner invitation | Factor Matching |
| --- | --- | --- | --- |
| Already in a relationship | Complete the personal baseline, then invite the existing partner | Available | Hidden and server-denied |
| Single / seeking | Complete the personal and Matching baseline, then use discovery | Hidden | Available when the profile is ready |

The declaration selects the onboarding path; an actual `Pair` record remains the authority for whether a pair exists. The repository does **not** implement this complete split yet. A future feature change must define how the declaration is stored, whether/how it can change, and how changing it interacts with an active Pair before changing code or public contracts.

## Beta user-data reset status

**NOT EXECUTED as of 2026-09-05.**

- No user, Pair, invite, Matching, onboarding, answer, session-subject, audit, or related document was deleted during the interrupted cleanup attempt.
- No reset backup or isolated restore was created.
- The database must therefore be treated as still containing legacy beta state.
- Deleting only `users` is unsafe: stable Discord identities and linked onboarding/Pair/Matching/session records can reconnect the same people to old state.
- The normal privacy-deletion flow is not a clean-slate reset because its durable `DELETED` session-subject tombstone intentionally prevents the same Discord identity from registering again.

A future approved beta reset must use a maintenance window and this order:

1. Resolve and record the exact deployment and database aliases without printing the URI, credentials, user ids, or answer payloads.
2. Stop or otherwise fence application writes.
3. Create an encrypted named backup, restore it into isolation, and verify that the restore is readable.
4. Record aggregate collection counts and index names before the write.
5. Clear the explicitly reviewed user-generated graph with collection-level `deleteMany({})`, including `session_subjects`; do not drop the database or its collections.
6. Preserve `questionnaires`, `activity_templates`, `factor_definition_registry_releases`, and all collection/index definitions.
7. Verify zero remaining user-state documents, unchanged preserved-content counts, unchanged indexes, readiness, and a fresh Discord registration.

The reset has been requested and approved at the product level, but it still requires working target access and an operator review of the final aggregate plan immediately before execution. If it is run before the target first-entry split is implemented, every reset user will enter the current common onboarding flow and will encounter the known fresh-Matching profile gap.

## Weekly-cycle missing-index recovery note

The recovery behavior is deliberately narrow:

- execute the named-index reconciliation query first;
- retry once without the hint only when Mongo reports `code: 2`, `codeName: BadValue`, and the missing-index hint condition;
- emit the sanitized operational reason `RECONCILIATION_INDEX_FALLBACK`;
- rethrow every other first-query error and every retry error;
- retain the same filter, ordering, projection, and eight-row bound on both attempts.

An unhinted query can scan/sort more work even with a bounded result. Production operations must restore the declared index and confirm it with the target preflight rather than treating the fallback as a permanent index strategy.

## Historical next-step plan before implementation

This list records the earlier plan, not the current work queue. Entry is implemented; use [the current implementation handoff](PRODUCT_IMPLEMENTATION.md) for remaining target configuration and Discord checks. The proposed reset below was not executed and is not a prerequisite for the isolated local tests.

1. Implement and verify the agreed first-entry cohort split, including the missing fresh-Matching profile fields and the menu gates.
2. Decide and implement the promised post-onboarding privacy-policy editing flow.
3. Verify the exact Vercel deployment SHA and required environment variable names without exposing their values.
4. Verify and restore the declared Atlas indexes, especially the weekly reconciliation index.
5. Execute the guarded backup/restore/reset procedure and record aggregate evidence only.
6. Run the real two-account Discord checklist for both paths: relationship invitation/Pair formation and single-user Matching.
