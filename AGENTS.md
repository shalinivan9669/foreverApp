# AGENTS

## Primary Context
- `docs/` is the primary source of project context, including `docs/ADR` and `docs/_evidence`.

## Working Rules
- Before starting any task, read the relevant files in `docs/` first.
- After any meaningful change in code, behavior, architecture, or documentation, update the relevant docs.
- Always append a short note to `docs/CHANGELOG.md` describing what changed and which files were touched.
- If no suitable doc exists, create one under `docs/` and note it in the changelog.

## Build Blockers
- Do not introduce `any` or `unknown` without explicit, justified typing.
- Fix `@typescript-eslint/no-explicit-any` violations by using proper types, not disabling rules.
- Follow `next/next/no-img-element` where active; replace raw `<img>` with `next/image` when the rule blocks builds.

## Pre-finish Checks
- For changes in `src/`, run `npm run lint` before finishing.
- If changes affect typing or the build pipeline, run `npm run build` (or `npm run typecheck` if the repo has it).

## Safe Fixing
- Prefer correct typing and API usage over suppressing lint/type errors.

## Notes Format
- Date: YYYY-MM-DD
- Summary: 1-3 short bullet points
- Files: list of touched paths
