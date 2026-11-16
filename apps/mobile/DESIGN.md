# Sanad mobile — design system

Mode: **Operate** (people finish a task fast: punch, check the bonus, send a leave request). Brand shows through
precise details, not decoration. Arabic first (RTL), English second; light and dark are both first-class.

## Identity
- Navy `#0B1A33` and gold `#C9A24B` (owner decision 2026-11-16). Cream `#F6F1E6` is the light background.
- The top app bar (`Header`) is navy in both themes. Cards are white (light) / navy-mid (dark) with a hairline border.
- Gold is for the one thing that matters on a screen (the punch-in button, the active badge, links). Never gold text on cream for body copy.
- Font: Tajawal (400 / 500 / 700 / 800). Digits that are times, dates or counts use `<Txt numeric>` (left-to-right).

## Tokens (`src/lib/theme.ts`)
- Space: 4 / 8 / 12 / 16 / 24 / 32. Screen gutter 16. Card padding 16. Sections 24 apart (Screen gap is 16).
- Radius: 10 (fields, chips), 16 (cards, buttons), 24 (hero), pill.
- Type: display 34 · title 22 · heading 17 · body 15 · label 13 · caption 12 (line heights are generous for Arabic).
- Touch target: 48dp minimum everywhere (`TOUCH`).
- Palette from `useSettings().c`: `bg surface surfaceAlt text muted line primary onPrimary accent ok danger`. Never hard-code colours except navy/gold/cream brand values already used in the kit.

## Components (`src/components/ui.tsx`) — use these, don't restyle per screen
`Header` (navy bar, `back`, `actions`, `big`, children for hero content) · `Screen` (scroll, gutters, safe area, `footer` for the primary form action, `refreshControl`) ·
`Txt` (variant/tone/numeric) · `Icon` (Ionicons) · `Row` (follows reading direction) · `Gap` · `Card` (flat, optional `onPress`) · `Section` (heading + link) ·
`ListRow` (icon, title, subtitle, trailing, chevron) · `StatTile` · `Button` (`primary | gold | danger | secondary | ghost`, `size="lg"`) ·
`IconButton` (48dp, badge) · `Chip` · `Segmented` · `Badge` (`ok | danger | warn | info | neutral`) · `Notice` (tinted inline message) ·
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
