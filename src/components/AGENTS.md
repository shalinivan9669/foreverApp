# AGENTS

Shared components should be mostly presentational.

## Rules

- Do not import Mongoose models, server-only auth, or domain services.
- Avoid direct API calls unless the component is explicitly a container and no feature layer exists.
- Keep user-facing Russian text readable, no mojibake.
- Do not mix large orchestration logic into small UI components.
- Prefer typed props and stable view-model shapes.
- Keep loading, error, and empty states visually consistent with existing shared UI.

