# Troubleshooting

## Local setup

- If `next` or `tsc` is not recognized, run `npm install`; `node_modules` is required for package scripts.
- In PowerShell, `npm` may resolve to `npm.ps1` and be blocked by execution policy. Use `npm.cmd run <script>` instead.
- Private API calls require the session cookie. Browser clients for private endpoints should send `credentials: include`.

## Build and lint

- `npm run lint` uses the ESLint CLI (`eslint .`) with `eslint.config.mjs`.
- `npm run check:agents` runs compact repository diagnostics for agent-boundary issues.
- For doc-only changes, do not run build unless the docs changed env contracts, scripts, or build configuration.

## Discord embedded context

- Embedded/proxied HTTPS contexts require session cookies compatible with Discord iframe behavior.
- Keep redirect URI and client ID in sync with Discord application settings and `.env.local`.
