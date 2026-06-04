# AGENTS

Business logic belongs here.

## Rules

- State transitions belong in `src/domain/state`.
- Services may call models, state machines, audit, idempotency helpers, and entitlements helpers as needed.
- Do not import React, Next UI, browser APIs, or client code.
- Keep domain errors explicit and map them to API at the route boundary.
- For multi-document writes, reason about atomicity, transaction, or safe ordering.
- Keep vector/scoring logic deterministic and selfcheckable.

