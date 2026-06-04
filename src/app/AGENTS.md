# AGENTS

This directory contains Next App Router pages and API routes.

## API routes

- For `src/app/api/**/route.ts`, keep handlers thin.
- Use shared validation helpers from `src/lib/api/validate.ts`.
- Use shared auth guards from `src/lib/auth/**`.
- Use shared response helpers from `src/lib/api/response.ts`.
- Return DTOs from `src/lib/dto/**`, not raw Mongoose documents.
- Do not place business workflows directly in route handlers.

## Pages and components

- Server-only code must not be imported into client components.
- Client components must explicitly use `'use client'`.
- Prefer feature views/hooks/client API over page-level orchestration.
- Keep route files focused on routing, data entry, and composition.

