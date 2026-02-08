# Domain Service Checklist

- [ ] Service owns business rules; controller remains orchestration-only.
- [ ] All DB reads/writes happen in the service layer.
- [ ] State transitions use centralized machine helpers, not inline string checks.
- [ ] Service emits audit events for significant security/business actions.
- [ ] Service maps entities to DTO-ready structures (no raw model leakage).
- [ ] Service returns typed errors (`DomainError`/`ApiClientError`) with stable error codes.
- [ ] Cross-aggregate updates are consistent and documented in docs/ADR when needed.
