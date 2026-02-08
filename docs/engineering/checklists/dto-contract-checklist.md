# DTO Contract Checklist

- [ ] API response uses envelope with explicit DTO shape.
- [ ] DTO is intentionally different from DB model when privacy/internal fields exist.
- [ ] Private-only fields are documented as private scope and never leaked in public endpoints.
- [ ] Endpoint returns `id`/stable keys consistently (no mixed `_id` and `id` contract without adapter).
- [ ] Client parses envelope through typed API helpers, not ad-hoc `res.json()` usage.
- [ ] Client maps DTO to view-model before render logic.
- [ ] Contract changes are reflected in `docs/04-api-contracts.md`.
