# Frontend Playbook

## Core rules
1. Do not call `fetch('/.proxy/api/...')` directly inside `page.tsx` or presentational view components.
2. Keep layers explicit:
   - `src/client/api/*`: typed API calls only.
   - `src/client/hooks/*`: state, caching, orchestration.
   - `src/client/viewmodels/*`: DTO to VM mapping.
   - View components: props/callbacks only; no API/client knowledge.
3. Error UX mapping must be deterministic:
   - `ENTITLEMENT_REQUIRED` or `QUOTA_EXCEEDED` -> `PaywallView`.
   - `RATE_LIMITED` -> show `retryAfterMs`.
   - `AUTH_REQUIRED` -> restart auth flow.
4. Array safety:
   - Run `map/filter/reduce` only after array type guarantees.
   - Use type guards and `Array.isArray(...)` fallback when shape is uncertain.
5. Idempotency:
   - For critical mutations, pass idempotency option in typed HTTP client calls.

## Anti-patterns (forbidden)
- Calling `res.json()` directly in UI instead of shared `http` and envelope parser.
- Creating a god `page.tsx` (200+ lines, many `useEffect`, inline orchestration and API calls).
- View components that know DTO internals, endpoint URLs, or transport details.
