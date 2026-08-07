# Code Review

## Review checklist

- Does the change match the requested scope?
- Are architecture boundaries preserved?
- Are API responses still envelope-shaped?
- Are DTO boundaries preserved?
- Is auth subject taken from session?
- Are resource guards used where needed?
- Are mutations idempotent where needed?
- Are multi-document updates safe?
- Are logs free from secrets/PII?
- Are tests/checks appropriate but not excessive?
- Did the task stay inside its operating mode and requested scope?
- Did agent diagnostics pass or were warnings explained?
- Are new allowlist entries justified and reported?
- Is the final report concise?
