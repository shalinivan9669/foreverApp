# Testing

Run checks by blast radius. Do not run heavy suites just because they exist.

| Change type | Minimum checks | Extra checks |
| --- | --- | --- |
| docs only | no build required, verify links/paths | none |
| UI component only | lint relevant files if possible | build if shared component |
| client API/hook | typecheck + targeted usage check | build |
| API route | typecheck + targeted route tests/selfcheck | build |
| domain service | unit/selfcheck for service/state | build |
| auth/security | targeted tests + manual reasoning in report | full build |
| model/schema | typecheck + DTO exposure review | migration notes |
| broad refactor | lint + typecheck + build + relevant selfchecks | full suite |

## Existing commands

- `npm run lint` - existing lint command.
- `npm run check:types` - TypeScript no-emit check.
- `npm run check:self` - fast activity/client-error selfchecks.
- `npm run check:agents` - compact agent diagnostics.
- `npm run check:agents:json` - machine-readable agent diagnostics.
- `npm run check:agents:changed` - diagnostics limited to changed files.
- `npm run check:quick` - types plus fast selfchecks.
- `npm run check:build` - Next production build.
- `npm run selfcheck:activity-flow` - activity flow selfcheck.
- `npm run selfcheck:client-errors` - client error mapping selfcheck.
- `npx tsx ./scripts/security-critical.selfcheck.ts` - targeted auth/resource, OAuth redirect, DTO privacy, lifecycle, and match-confirm ordering selfcheck. If PowerShell blocks `npx.ps1`, use `node ./node_modules/tsx/dist/cli.mjs ./scripts/security-critical.selfcheck.ts`.
- `npm run seed:questions` - seed questionnaire data.

## Report rule

- Do not paste full command logs.
- Show command, result, and only relevant failure excerpt.
- If a command is unavailable, say exactly why.

## Agent diagnostics

- `error` blocks the change.
- `warning` must be reported but does not block unrelated small tasks.
- `info` is context only.
- Allowlist entries require `rule`, `file`, `reason`, and optional `expires`.
- Expired allowlist entries do not suppress findings.
- Any new allowlist entry must be mentioned in the final report.
