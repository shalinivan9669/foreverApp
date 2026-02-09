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

## Responsive range update (2026-02-09)
- Expanded layout behavior from phone to desktop on core UI surfaces without changing business flows.
- Updated containers and grids to avoid "mobile-only" narrow layouts on wide screens:
  - `main-menu` now uses a two-column adaptive shell on tablet/desktop while preserving mobile tile stack.
  - `match` feed/inbox/details now support wider containers, adaptive grids, and wrapped action rows.
  - `activities` and `questionnaires` now use responsive card grids and wrapped action controls.
- Updated modal and card action rows for narrow screens:
  - action buttons stack on small viewports and return to inline layout on larger breakpoints.
  - modal sheets keep bottom-sheet behavior on mobile and centered dialog behavior on larger screens.

## Visual polish pass (2026-02-09)
- Added a shared polish layer in `globals.css`:
  - `app-shell` / `app-shell-compact` for consistent page rhythm and readable line length.
  - improved `app-panel` and `app-panel-soft` surfaces with soft gradients and clearer depth.
  - unified button ergonomics (`min-height`, focus rings, hover lift) across all `app-btn-*` variants.
  - `app-lift` and `app-reveal` helpers for lightweight motion and hover affordance.
  - `prefers-reduced-motion` fallback to disable animations when needed.
- Applied the polish layer to core UI flows:
  - menu tiles, activity cards, questionnaire cards, inbox rows, and state blocks now share the same interaction language.
  - loading/empty/error/paywall blocks now follow one visual hierarchy.
- Normalized visible match-flow text to readable Russian in the key screens (`search`, `inbox`, `match-card/create`, `match like details`, and tabs).
