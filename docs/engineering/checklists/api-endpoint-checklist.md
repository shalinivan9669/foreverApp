# API Endpoint Checklist

- [ ] `route.ts` is thin and calls exactly one domain service entrypoint.
- [ ] Private route uses `requireSession(...)`.
- [ ] Resource-scoped route uses resource guard (`pair/activity/like` membership).
- [ ] Input validation uses `parseJson/parseQuery/parseParams`.
- [ ] Abuse-prone route applies `enforceRateLimit(...)`.
- [ ] Paid/limited features apply `assertEntitlement(...)` and `assertQuota(...)`.
- [ ] Critical mutation is wrapped with `withIdempotency(...)`.
- [ ] Response uses `jsonOk(dto)` or standardized `jsonError(...)`.
- [ ] Error codes follow backend playbook mapping (`400/401/403/404/409/422/429/500`).
- [ ] Endpoint documentation exists or is updated (`docs/04-api-contracts.md` or endpoint template file).
