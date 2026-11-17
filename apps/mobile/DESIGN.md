# Sanad mobile — design system

Mode: **Operate** (people finish a task fast: punch, check the bonus, send a leave request). Brand shows through
precise details, not decoration. Arabic first (RTL), English second; light and dark are both first-class.

## Identity
- "Sea glass" (owner decision 2026-11-17), the same palette as the web panel (root `DESIGN.md`, `apps/admin/src/app/globals.css`).
  Colours come from the Kuwait Towers' enamel discs: deep sea teal `#0e5a61`, turquoise `#1fa89c` / `#5fd3c6`, a misted ground `#eef4f3`. It replaces navy + gold.
- The top app bar (`Header`) and the sign-in band are rail teal `#0d3b41` in both themes, with white titles and `#c1dcd9` subtitles. Cards are white (light) / deep sea `#10262a` (dark) with a 1px line border.
- Turquoise is for the one thing that matters on a screen: the punch-in button (`Button kind="hero"`), the lit mark on the teal band, the notification count. Links and focus use the primary teal.
- Warnings (late, missing check-out) use the `warn` amber tone, never turquoise. Status badges carry a small disc and a word, like the panel.
- Font: Tajawal (400 / 500 / 700 / 800). Digits that are times, dates or counts use `<Txt numeric>` (left-to-right).

## Tokens (`src/lib/theme.ts`)
- Space: 4 / 8 / 12 / 16 / 24 / 32. Screen gutter 16. Card padding 16. Sections 24 apart (Screen gap is 16).
- Radius: 10 (fields), 14 (cards), 24 (hero sheet), pill (buttons, chips, badges).
- Type: display 34 · title 22 · heading 17 · body 15 · label 13 · caption 12 (line heights are generous for Arabic).
- Touch target: 48dp minimum everywhere (`TOUCH`).
- Palette from `useSettings().c`: `bg surface surfaceAlt text muted line control primary onPrimary accent ok warn danger hero onHero onDanger`.
  Fixed values that do not follow the theme are in `brand` (rail, onRail, railInk, railDot, ink). Badge / notice / calendar tints come from `statusTints(c)`.
  Never hard-code colours in a screen; the emergency map's red and green are the only exemption (safety meaning).
- Inputs use the `control` edge (3:1 against the surface); `line` is for cards and dividers. Every text pair passes 4.5:1 in both themes.

## Components (`src/components/ui.tsx`) — use these, don't restyle per screen
`Header` (teal bar, `back`, `actions`, `big`, children for hero content) · `Screen` (scroll, gutters, safe area, `footer` for the primary form action, `refreshControl`) ·
`Txt` (variant/tone/numeric) · `Icon` (Ionicons) · `Row` (follows reading direction) · `Gap` · `Card` (flat, optional `onPress`) · `Section` (heading + link) ·
`ListRow` (icon, title, subtitle, trailing, chevron) · `StatTile` · `Button` (pill: `primary | hero | danger | secondary | ghost`, `size="lg"`) ·
`IconButton` (48dp, badge) · `Chip` · `Segmented` · `Badge` (disc + word: `ok | danger | warn | info | neutral`) · `Disc` · `Notice` (tinted inline message) ·
`Skeleton` / `SkeletonCard` (loading) · `EmptyState` · `ErrorState` (with retry) · `Field` · `PickerField` · `useSnackbar()` (transient feedback) · `useDir()` (row, align, forward/back icons).

## Rules
- RTL: use `Row` / `useDir()` instead of `flexDirection: 'row'`; text alignment comes from `Txt`. Chevrons and back arrows come from `useDir()` so they flip.
- Loading = skeletons shaped like the content, not a centered spinner. Spinners only inside buttons.
- Success = snackbar (`useSnackbar()(t('...'), 'ok')`) then go back. Use a modal / Alert only to confirm something destructive (cancel a request, sign out).
- Errors say what happened and what to do, from `strings*.json`; failed loads show `ErrorState` with retry.
- Every list has an empty state with an icon and one sentence.
- Status is said in words (Badge label); colour only supports it.
- No emoji, no gradient text, no coloured side stripes on cards, no cards inside cards, no small all-caps labels above headings.
- System Back works everywhere (`router.back()`); forms keep their primary action in `Screen footer`.
- Pull to refresh on every screen that shows server data.
- Strings: never inline text. Add keys to your group's file (`src/lib/strings-a|b|c|d.json`, both `ar` and `en`); shared keys are in `strings.json` (read-only for screen agents).
