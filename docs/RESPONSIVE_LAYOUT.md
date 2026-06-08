# Responsive Layout

The UI uses separate layout modes instead of one global centered container.

## Page shells

- `app-shell-compact`: forms, questionnaire runners, and reading-oriented content.
- `app-shell`: card collections that need more width but still benefit from a moderate cap.
- `app-shell-dashboard`: profile, pair, diagnostics, and activity dashboards; expands across ultrawide viewports.
- `app-shell-menu`: full-screen main-menu bento composition.

Text length should be constrained locally with `app-reading-width`, not by narrowing the whole dashboard.

## Grid primitives

- `app-dashboard-grid`: one column on mobile, two columns on tablet, and a 12-track dashboard grid on desktop.
- `app-grid-full`, `app-grid-wide`, `app-grid-narrow`: explicit semantic spans for dashboard children.
- `app-collection-grid`: fluid `auto-fit` card collections.
- `app-metric-grid`: compact responsive KPI groups.
- `app-menu-grid`, `app-menu-hero`, `app-menu-tile`: stable bento layout for the main menu.

Do not position dashboard sections with `:nth-child`; section roles must stay explicit in JSX so reordering content does not silently break the layout.

## Viewport expectations

- Narrow Discord/mobile viewports keep a single-column flow and must not scroll horizontally.
- Tablet layouts may use two columns where card content remains readable.
- Desktop and ultrawide dashboards should place primary and supporting sections side by side.
- Questionnaire runners remain reading-oriented and do not stretch form controls across the full screen.
