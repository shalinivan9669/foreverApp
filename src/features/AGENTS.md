# AGENTS

Feature views may orchestrate UI state but should prefer hooks/client API.

## Rules

- Do not expose raw API/DB shapes deep into presentational components.
- Map DTOs to feature view models where useful.
- Keep loading/error/empty states consistent.
- Prefer `src/client/hooks/**` for data and flow orchestration.
- Keep feature components scoped to one user flow.
- Do not import Mongoose models or server-only auth.

