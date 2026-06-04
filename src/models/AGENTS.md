# AGENTS

Mongoose schemas live here.

## Rules

- Schema changes require DTO review.
- Index changes require explanation.
- Do not store secrets.
- Be careful with PII fields.
- Backward compatibility matters because existing Mongo documents may not match new schema.
- Do not import UI, client hooks, or React components.
- Keep model methods free from UI transport assumptions.

