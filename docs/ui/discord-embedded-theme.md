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

## Palette and motion refresh (2026-02-09)
- Retuned global colors to a warm pastel palette based on product art references:
  - cream-peach base background with pink accents.
  - warm text/border tones replacing cold blue defaults.
  - updated focus ring and interactive glow colors for consistent contrast.
- Smoothed interaction feel in shared primitives:
  - slower spring-like easing for `app-lift` and `app-reveal`.
  - retuned button hover/active depth and shadows.
  - preserved `prefers-reduced-motion` safe behavior.
- Added reusable UI classes for coherence:
  - `app-backbar` and `app-backbar__button` for navigation chrome.
  - `app-alert` variants (`paywall`, `rate`, `auth`, `error`) for state blocks.
  - `app-tile` variants (`rose`, `honey`, `spark`, `blush`, `aura`) for main-menu cards.
- Applied the new classes to primary menu tiles and shared state components (`PaywallView`, `ErrorView`, `BackBar`) without changing routing or business logic.

## Depth and contrast refinement (2026-02-09)
- Reduced perceived flatness across the app by adding layered color depth to shared surfaces:
  - `app-panel` now has dual radial tints + subtle multi-color top accent line.
  - `app-panel-soft` now has soft mint highlight for visual separation from default panels.
  - `app-alert*` variants now include radial tint overlays and vertical edge highlights.
- Increased palette diversity for main-menu navigation cards:
  - introduced additional tile variants (`app-tile-mint`, `app-tile-plum`) and retuned existing variants.
  - updated cards to use more distinct hue families per destination (rose/mint/plum/spark/aura).
- Added gentle background and card texture/motion:
  - global background now mixes warm/pink/mint fields with a subtle linear texture overlay.
  - `app-tile` gradients now use a slow `app-gradient-breathe` animation (disabled by existing reduced-motion fallback).
