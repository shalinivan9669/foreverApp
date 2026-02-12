# Typography

## Font Tokens
- `font-sans`: base UI text, forms, long descriptions, helper text.
- `font-display`: `Cormorant Infant` for headings, tile/card titles, key numbers.
- `font-accent`: `Hachi Maru Pop` for short accent lines only (badges, mini-slogans, fun hints).

## Usage Rules
- Keep all long-form text in `font-sans`.
- Use `font-display` for hierarchy:
  - `h1`: `700` + tight leading.
  - `h2`: `600`.
  - `h3` and card/tile titles: `500-600` (default `600` for titles).
- Use `font-accent` only for short strings and keep it under ~5-10% of visible UI.
- Never use `font-accent` for body copy, instructions, multi-line descriptions, or form content.

## Component Mapping
| Component | Typography |
| --- | --- |
| `src/components/main-menu/*Tile.tsx` | Tile titles: `font-display` `600`; `LootboxTile` badge/slogan: `font-accent` `400`. |
| `src/components/activities/ActivityCard.tsx` | Activity title: `font-display` `600`; description/meta: `font-sans`. |
| `src/components/activities/UserActivityCard.tsx` | Current/suggested activity titles: `font-display` `600`; progress/meta: `font-sans`. |
| `src/components/profile/UserHeader.tsx` | User name/handle: `font-display` `700`; status/nav text: `font-sans`. |
| `src/components/profile/SummaryTiles.tsx` | Metric values: `font-display` `600`; labels: `font-sans`. |
| `src/components/QuestionCard.tsx` | Question heading: `font-display` `500`; answer controls text: `font-sans`. |
| `src/components/QuestionnaireCard.tsx` | Card title: `font-display` `600`; subtitle/meta/tags: `font-sans`. |
| `src/components/ui/EmptyStateView.tsx` | Title: `font-display` `600`; optional short description may use `font-accent`; long description stays `font-sans`. |

## Technical Notes
- Google fonts are loaded via `next/font/google` in `src/app/layout.tsx`.
- Fonts are exposed as CSS variables and consumed by Tailwind tokens (`display`, `accent`, `sans`).
- Cyrillic subsets are enabled for both configured fonts.
