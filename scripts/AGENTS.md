# AGENTS

Scripts should be safe, explicit, and documented.

## Rules

- Seed scripts must not destroy data unless clearly named and guarded.
- Selfcheck scripts should be small, deterministic, and fast.
- Do not require production secrets for local selfchecks unless unavoidable.
- Prefer targeted scripts over broad all-in-one checks.
- Print compact pass/fail output; avoid dumping full payloads or secrets.

