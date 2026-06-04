# AGENTS

This is browser/client orchestration.

## Rules

- Prefer typed API clients over direct fetch in UI.
- Use `credentials: include` where private API requires session.
- Do not store Discord access tokens in persistent storage.
- Keep DTO-to-view-model mapping outside low-level presentational components when possible.
- Error handling should use shared API error mapping.
- Do not expose endpoint URLs deep inside presentational components.
- Keep hooks focused on state, loading/error handling, and orchestration.

