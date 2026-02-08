# Discord Embedded UI Theme (2026-02-08)

## Goal
- Make UI colors deterministic inside Discord iframe where host theme defaults can cause low contrast (`white on white`, `black on black`).
- Keep existing product structure and flows unchanged.

## What was changed
- Added explicit app color tokens and base surfaces in `src/app/globals.css`.
- Forced deterministic light color scheme (`color-scheme: light`) and removed runtime `prefers-color-scheme` flipping.
- Added reusable UI utility classes:
  - `app-panel`, `app-panel-soft`
  - `app-muted`
  - `app-btn-primary`, `app-btn-secondary`, `app-btn-danger`, `app-btn-success`
- Normalized key shared UI surfaces to explicit colors:
  - main menu tiles
  - back bar
  - activity cards and check-in modal
  - match tabs, candidate cards, like modal, inbox modal
  - questionnaire cards and question controls
  - loading and empty states

## Why this fixes Discord visibility issues
- Content no longer depends on host dark/light defaults.
- Surface + text contrast is explicitly set on base tokens and shared components.
- Buttons and inputs now have explicit background/text/border colors in all states.

## Scope limits
- No API, business logic, state machine, or database behavior changes.
- No route or navigation changes.
