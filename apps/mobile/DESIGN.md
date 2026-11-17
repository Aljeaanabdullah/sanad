# Sanad mobile — design system

Mode: **Operate** (people finish a task fast: punch, check the bonus, send a leave request). Brand shows through
precise details, not decoration. Arabic first (RTL), English second; light and dark are both first-class.

## Identity: "sea glass" (owner decision 2026-11-17, replaces navy + gold)
- The same identity as the web panel (root `DESIGN.md`): deep sea teal `#0e5a61`, turquoise `#1fa89c`, a misted ground `#eef4f3`, white surfaces, deep ink `#0f2a2e`, muted `#536b6b`, line `#d6e3e1`, and the web's danger / ok / warn / info pairs. The app and the panel read as one product.
- The top app bar (`Header`) and the side menu are **rail teal** `#0d3b41` (the web rail), `#071416` at night with a hairline edge. White title, `#c1dcd9` subtitle.
- Turquoise is for the one thing that matters on a screen: the punch-in button (`Button kind="accent"`), the Sanad button, the badge on the bell, the lit disc of the current menu item. As text in light mode the accent is deepened to `#127a71` (`c.accent`) so it passes AA; the bright fill is `c.accentFill` with dark ink `c.onAccent`.
- Dark theme = the Gulf at night, same values as the web dark theme: ground `#0a1a1c`, surfaces `#10262a`, text `#e4f0ee`, primary turquoise `#5fd3c6` with ink `#062528`.
- Font: **Readex Pro** (400 / 500 / 600 / 700), the web panel's one typeface, for Arabic and Latin. Digits that are times, dates or counts use `<Txt numeric>` (left-to-right, tabular).
- Logo: the «س» in a turquoise diamond (`BrandMark`, temporary until a final logo is approved). The wordmark سَنَد is white on rail teal.

## Navigation (PRD 18.2)
- **No bottom tab bar.** Section roots (Home `/`, Requests `/requests`, Reports `/reports`, Account and settings `/more`) show the **three-line menu button** on the reading start of the header; pushed screens show Back instead.
- **Side menu** (`components/nav/SideMenu.tsx`): slides in from the right in Arabic, from the left in English; the mobile twin of the web rail. Lists every section in groups: Home, Requests, Reports, My dashboard · Employee of the month (`/ideal-employee`), Ideas box (`/ideas`), Notifications, Emergency, Ask Sanad · Approvals and Employee record (staff only) · Account and settings. The current item has the `barOn` fill and one lit disc (`barDot`). Back or a tap outside closes it; reduced motion removes the slide. Moving from one section to another replaces the screen; Home pops back to Home; anything else is pushed.
- **The Sanad button** (`components/nav/SanadButton.tsx`): one 64dp round button at the bottom centre over the section roots, above the safe area. A rail-teal disc ringed with twelve small enamel discs (the towers' sequins) and the «س» mark, standing on a ring of the screen ground. It opens the assistant. Label «اسأل سَنَد», with a hint. `Screen` leaves room under the last card for it (`SANAD_BUTTON_ROOM`), and the snackbar shows above it.
- Menu items and their order live in `src/lib/nav.ts` (`menuGroups`, `navAction`); labels are the `menu_*` keys in `strings.json`.

## Tokens (`src/lib/theme.ts`)
- Space: 4 / 8 / 12 / 16 / 24 / 32. Screen gutter 16. Card padding 16. Sections 24 apart (Screen gap is 16).
- Radius: 10 (fields, chips), 16 (cards, buttons), 24 (hero), pill.
- Type: display 30 · title 21 · heading 16 · body 15 · label 13 · caption 12 (Readex Pro is wide, so the big sizes are a step smaller than with Tajawal).
- Touch target: 48dp minimum everywhere (`TOUCH`).
- Palette from `useSettings().c`: `bg surface surfaceAlt text muted line controlLine primary onPrimary accent accentFill onAccent ok okSoft danger dangerSoft onDanger warn warnSoft info infoSoft bar barInk barMuted barOn barDot snack`. Never hard-code colours in a screen; the emergency map's red and green are the only exemption.

## Components (`src/components/ui.tsx`) — use these, don't restyle per screen
`Header` (rail-teal bar, `back`, `actions`, `big`, children for hero content; menu button when there is no `back`) · `Screen` (scroll, gutters, safe area, `footer` for the primary form action, `refreshControl`) ·
`Txt` (variant/tone/numeric; tones `default muted primary accent ok warn danger onPrimary`) · `Icon` (Ionicons) · `Row` (follows reading direction) · `Gap` · `Card` (flat, optional `onPress`) · `Section` (heading + link) ·
`ListRow` (icon, title, subtitle, trailing, chevron) · `StatTile` · `Button` (`primary | accent | danger | secondary | ghost`, `size="lg"`; `gold` is an old alias of `accent`) ·
`IconButton` (48dp, badge) · `Chip` · `Segmented` · `Badge` (`ok | danger | warn | info | neutral`) · `Notice` (tinted inline message) ·
`Skeleton` / `SkeletonCard` (loading) · `EmptyState` · `ErrorState` (with retry) · `Field` · `PickerField` · `useSnackbar()` (transient feedback) · `useDir()` (row, align, forward/back icons).

## Rules
- RTL: use `Row` / `useDir()` instead of `flexDirection: 'row'`; text alignment comes from `Txt`. Chevrons and back arrows come from `useDir()` so they flip.
- Loading = skeletons shaped like the content, not a centered spinner. Spinners only inside buttons.
- Success = snackbar (`useSnackbar()(t('...'), 'ok')`) then go back. Use a modal / Alert only to confirm something destructive (cancel a request, sign out).
- Errors say what happened and what to do, from `strings*.json`; failed loads show `ErrorState` with retry.
- Every list has an empty state with an icon and one sentence.
- Status is said in words (Badge label); colour only supports it. Warnings use `warn`, not the accent.
- No emoji, no gradient text, no coloured side stripes on cards, no cards inside cards, no small all-caps labels above headings.
- System Back works everywhere (`router.back()`); forms keep their primary action in `Screen footer`.
- Pull to refresh on every screen that shows server data.
- Strings: never inline text. Add keys to your group's file (`src/lib/strings-a|b|c|d|e|f.json`, both `ar` and `en`); shared keys are in `strings.json` (read-only for screen agents).
