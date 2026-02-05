# AGENTS

## Primary Context
- `docs/` is the primary source of project context, including `docs/ADR` and `docs/_evidence`.

## Working Rules
- Before starting any task, read the relevant files in `docs/` first.
- After any meaningful change in code, behavior, architecture, or documentation, update the relevant docs.
- Always append a short note to `docs/CHANGELOG.md` describing what changed and which files were touched.
- If no suitable doc exists, create one under `docs/` and note it in the changelog.

## Notes Format
- Date: YYYY-MM-DD
- Summary: 1-3 short bullet points
- Files: list of touched paths
