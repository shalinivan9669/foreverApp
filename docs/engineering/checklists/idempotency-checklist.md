# Idempotency Checklist

- [ ] Mutation is classified as critical (user-triggered retry risk, duplicate side effects, billing-sensitive, or cross-entity write).
- [ ] Endpoint accepts idempotency key via shared client/server contract.
- [ ] Handler uses `withIdempotency(...)` and replay storage.
- [ ] Replayed response returns stable envelope and status.
- [ ] Mismatch/conflict cases return `IDEMPOTENCY_*` (`409` or `422`).
- [ ] TTL and uniqueness constraints for idempotency records are configured.
- [ ] Endpoint docs mention idempotency behavior.
