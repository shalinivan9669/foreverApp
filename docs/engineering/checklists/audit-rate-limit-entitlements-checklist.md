# Audit, Rate Limit, Entitlements Checklist

- [ ] Sensitive endpoints emit auditable events through a single event API.
- [ ] Event payload excludes secrets and raw body dumps.
- [ ] Retention tier is assigned and stored with derived `expiresAt`.
- [ ] Abuse-prone routes enforce rate limiting and return `RATE_LIMITED` (`429`) with `retryAfterMs`.
- [ ] Rate-limit overflow is observable (event/log signal).
- [ ] Paid features enforce `assertEntitlement(...)` and return `ENTITLEMENT_REQUIRED` (`402`) when blocked.
- [ ] Usage caps enforce `assertQuota(...)` and return `QUOTA_EXCEEDED` (`403`) when blocked.
- [ ] Security/privacy docs are updated if rules changed.
