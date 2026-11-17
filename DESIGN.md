---
name: Sanad Panel
description: Sea glass. The web panel of Sanad, coloured from the Kuwait Towers' enamel discs.
colors:
  primary: "#0e5a61"
  primary-hover: "#0a484e"
  primary-soft: "#e2f1ef"
  on-primary: "#ffffff"
  accent: "#1fa89c"
  background: "#eef4f3"
  background-warm: "#f5f3ee"
  background-cool: "#e6f1f0"
  surface: "#ffffff"
  surface-2: "#f4f9f8"
  foreground: "#0f2a2e"
  muted: "#536b6b"
  line: "#d6e3e1"
  line-strong: "#b4c9c6"
  control-line: "#6f8f8b"
  rail: "#0d3b41"
  rail-ink: "#c1dcd9"
  rail-muted: "#a6cbc7"
  rail-hover: "#134950"
  rail-on: "#18555c"
  rail-on-ink: "#ffffff"
  rail-dot: "#5fd3c6"
  danger: "#b3332b"
  danger-soft: "#fbebe8"
  ok: "#1a7359"
  ok-soft: "#e1f3ec"
  warn: "#8f5407"
  warn-soft: "#fbf0d8"
  info: "#24627f"
  info-soft: "#e3eff6"
  disc-scheduled: "#0e5a61"
  disc-on-time: "#2c9c7c"
  disc-late: "#e0a030"
  disc-not-arrived: "#e2705a"
  disc-absent: "#b3332b"
  disc-leave: "#7f9db5"
  disc-upcoming: "#c3d0d0"
  disc-out: "#2c6f93"
typography:
  display:
    fontFamily: "Readex Pro, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: "2.25rem"
  headline:
    fontFamily: "Readex Pro, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: "2rem"
  title:
    fontFamily: "Readex Pro, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: "1.5rem"
  body:
    fontFamily: "Readex Pro, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.5rem"
  body-sm:
    fontFamily: "Readex Pro, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  label:
    fontFamily: "Readex Pro, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: "1.25rem"
  caption:
    fontFamily: "Readex Pro, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: "1rem"
rounded:
  lg: "9px"
  xl: "12px"
  2xl: "14px"
  full: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.full}"
    padding: "8px 20px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.full}"
    padding: "8px 16px"
    height: "40px"
  button-secondary-hover:
    backgroundColor: "{colors.primary-soft}"
  button-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.danger}"
    rounded: "{rounded.full}"
    padding: "8px 16px"
    height: "40px"
  button-danger-hover:
    backgroundColor: "{colors.danger-soft}"
  button-chrome:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.full}"
    padding: "4px 12px"
    height: "36px"
  input:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
    height: "40px"
  input-focus:
    backgroundColor: "{colors.surface}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.2xl}"
    padding: "20px"
  count-tile:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.2xl}"
    padding: "12px 16px"
  count-tile-selected:
    backgroundColor: "{colors.primary-soft}"
  badge-ok:
    backgroundColor: "{colors.ok-soft}"
    textColor: "{colors.ok}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  badge-warn:
    backgroundColor: "{colors.warn-soft}"
    textColor: "{colors.warn}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  badge-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  badge-info:
    backgroundColor: "{colors.info-soft}"
    textColor: "{colors.info}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  badge-off:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.muted}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  nav-item:
    textColor: "{colors.rail-ink}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
  nav-item-hover:
    backgroundColor: "{colors.rail-hover}"
    textColor: "{colors.rail-on-ink}"
  nav-item-active:
    backgroundColor: "{colors.rail-on}"
    textColor: "{colors.rail-on-ink}"
  tab:
    textColor: "{colors.muted}"
    typography: "{typography.body-sm}"
    padding: "8px 12px"
  tab-active:
    textColor: "{colors.primary}"
---

# Design System: Sanad Panel

Scope: this file covers the web panel (`apps/admin`) only. The mobile app (`apps/mobile`) keeps its older navy + gold identity for now and has its own `apps/mobile/DESIGN.md`. Everything here was read from the shipped panel code (`apps/admin/src/app/globals.css` and `apps/admin/src/components/ui.tsx`), not from a plan, and was refreshed after the review fixes of the same day. The owner chose this identity on 2026-11-17; it replaces navy + gold for the panel.

## Overview

**Creative North Star: "Sea Glass"**

The panel takes its colour from the enamel discs on the Kuwait Towers: deep sea teal, turquoise, and a misted ground. The unit of the identity is the disc, a small filled circle. A day's attendance is shown as a field of 100 discs, the current page in the menu carries one lit disc, every state badge starts with a disc, and an empty list shows three discs at rest. A supervisor sees the state of the shift before reading a number.

The panel is a working tool, so it is dense and calm. Surfaces are white cards with soft corners on a ground that drifts from warm sand to cool sea. Buttons are pills. There is one typeface, Readex Pro, for Arabic and Latin. Hierarchy comes from weight and colour, not from many sizes. Arabic (right-to-left) is the first language and English the second; both directions are built with logical properties so nothing flips wrongly. Dark mode is chosen by the user and reads as the Gulf at night: deep blue-green ground, turquoise primary.

This identity retires navy + gold for the panel, and it refuses the grey admin shell with a single blue accent.

**Key Characteristics:**
- The disc is the mark of state: in the shift field, the legend, the count tiles, badges, attendance history, the active menu item and empty states.
- Deep teal rail on the inline start; white cards on a drifting sand-to-sea ground.
- Pill buttons, 9px fields, 14px cards.
- One typeface, three weights (400, 500, 700), tabular numerals for anything counted or timed.
- State is always a disc plus a word, never colour alone.
- Motion is limited to 160ms state transitions (200ms for the disc field); reduced motion removes it.

## Colors

A sea palette: one deep teal that does the work, soft tints of it for surfaces and lines, and eight enamel hues reserved for attendance state.

### Primary
- **Deep Sea Teal** (`primary`): primary buttons, text links, the selected tab underline, the selected count tile's border, the focus ring, the text caret and native checkbox, radio and range controls. Hover deepens it (`primary-hover`). At 4% strength it is also the tint of a table's header row and of a hovered row, and at 30% it is the resting underline of a text link.
- **Sea Mist** (`primary-soft`): the hover fill of secondary and chrome buttons and the fill of the selected count tile.
- **Turquoise** (`accent`): text selection only (30% mix). It is the towers' bright disc colour, kept rare in light mode. In dark mode it becomes the primary. It exists only as a custom property; there is no utility class for it, so it is not available as a fill or a text colour.

### Secondary
- **Rail Teal** (`rail`): the navigation rail and the brand side of the sign-in screen. Its own ink set sits on it: `rail-ink` for menu text, `rail-muted` for the subtitle and disabled items, `rail-hover` and `rail-on` for hover and current item fills, `rail-on-ink` (white) for the wordmark and current item, and `rail-dot` (bright turquoise) for the lit disc and for focus rings inside the rail.

### Tertiary
The eight enamel discs. Each attendance state has one fixed hue, used by the disc field, its legend, the count tiles and the status column of attendance history. A hue is applied by setting the disc's colour variable on a disc; the hues are not available as fills, borders or text colours:
- **Teal** (`disc-scheduled`): scheduled today.
- **Sea Green** (`disc-on-time`): arrived on time.
- **Amber** (`disc-late`): arrived late.
- **Coral** (`disc-not-arrived`): shift started, not yet arrived.
- **Deep Red** (`disc-absent`): absent.
- **Grey-Blue** (`disc-leave`): on leave.
- **Pale Grey** (`disc-upcoming`): shift not started yet.
- **Deep Blue** (`disc-out`): checked out.

Semantic pairs for messages and badges, each a strong ink on its own soft tint: `danger` / `danger-soft`, `ok` / `ok-soft`, `warn` / `warn-soft`, `info` / `info-soft`.

### Neutral
- **Misted Sea** (`background`): the page ground. It is the middle stop of a fixed 135° gradient from **Warm Sand** (`background-warm`) to **Cool Sea** (`background-cool`).
- **White Surface** (`surface`): cards, tables, buttons at rest.
- **Shallow Water** (`surface-2`): field fill at rest, tile hover, the rows that hold a checkbox or radio choice, inset detail boxes and the off badge.
- **Deep Ink** (`foreground`): all body text. It is a very dark teal, not black.
- **Muted Teal-Grey** (`muted`): hints, table headers, placeholders, secondary lines.
- **Line** (`line`) and **Strong Line** (`line-strong`): card and table borders; and the stronger border on buttons, dashed empty states and scrollbars.
- **Control Line** (`control-line`): the edge of every input and select. It is darker than the other lines so the edge of a field reads at 3:1 against its surface.

### Dark theme
Dark mode is the same token names with night values, set on `:root.dark` in `globals.css` (that file is the source of truth for them). The ground becomes `#0a1a1c`, surfaces `#10262a`, text `#e4f0ee`, and the primary becomes turquoise `#5fd3c6` with dark ink `#062528` on it. Semantic inks turn light on dark tints, disc hues brighten slightly, the control line becomes `#4a7d84`, and the rail darkens to `#071416` and gains a hairline border on its inline end. The map follows: its tiles are inverted and dimmed, and its zoom and attribution controls take `surface`, `foreground` and `line`; the circles drawn on it keep their colours.

### Named Rules
**The Disc And Word Rule.** A state is always shown as a disc plus a word in a fixed place. Colour alone never carries meaning.

**The Fixed Hue Rule.** The eight disc hues belong to the eight attendance states. Do not reuse them for decoration or for a different meaning.

**The Token Only Rule.** Screens use the named tokens, which change with the theme. A raw hex in a screen breaks dark mode. Two things are exempt on purpose: the disc sphere picture, whose colours are fixed because it always sits on rail teal, and the emergency map, whose red and green keep their safety meaning.

## Typography

**Display Font:** Readex Pro (with system-ui, sans-serif)
**Body Font:** Readex Pro (with system-ui, sans-serif)

**Character:** One soft, rounded face covers Arabic and Latin, so a mixed line (an Arabic name beside a file number) reads as one voice. It is loaded with `next/font` for the `arabic` and `latin` subsets.

### Hierarchy
- **Display** (700, 1.75rem, line-height 2.25rem): the wordmark سَنَد in the rail (1.25rem on phones; 2.25rem on the sign-in brand side, 1.875rem in `primary` above the sign-in form on narrow screens). The count numerals in the live tiles and the employee dashboard tiles use the same size at weight 600.
- **Headline** (700, 1.5rem, line-height 2rem): the one page title on each screen.
- **Title** (700, 1rem; 1.125rem for a few section headings): card headings.
- **Body** (400, 1rem, line-height 1.5rem): buttons, field values, the user's name in the header.
- **Body small** (400, 0.875rem, line-height 1.25rem): tables, hints under the title, tabs, alerts, field labels (at weight 500). This is the most used size in the panel.
- **Label** (500, 0.8125rem): table column headers in muted ink; the disc field legend.
- **Caption** (400, 0.75rem): field hints, tile hints, badge text (at weight 500), the role line in the header.

### Named Rules
**The Rank By Weight Rule.** Inside a table every cell is the same size. Importance is shown with weight 500 and colour (a late count in `warn`, a name as a `primary` link), not with a bigger size.

**The Numbers Stay Left-To-Right Rule.** File numbers, times, dates and percentages are wrapped left-to-right and set in tabular numerals, in both languages, so columns line up and digits never flip. Arabic screens use Latin digits (locale `ar-KW-u-nu-latn`), and a time of day has one form everywhere: 24-hour, Kuwait time.

## Layout

On desktop (768px and up) a 240px rail is fixed to the inline start at full height, and the content column takes the rest. The content column has a header strip (name, role and file number on one side; language, theme and sign-out on the other) with a hairline under it, then the page with 32px side gutters and 28px top and bottom. On phones the rail becomes a sticky top bar: the wordmark, then the menu as one horizontally scrolling row of 40px-tall items that fades out over 24px at both edges in either direction, and the current item scrolls itself into view. Page gutters drop to 16px. The root keeps 4rem of scroll padding at the top so keyboard focus and in-page jumps never land under the sticky bar, and the map is its own stacking layer so it never paints over it.

A screen is one vertical stack with 20px between blocks (16px on the live board): title row, then cards. The title row is built in each screen: the headline, one muted help line under it, and the screen's actions on the inline end; it wraps on narrow screens. Screens cap their width by content: 72rem for boards and wide tables, 48rem for forms. Inside cards the rhythm is 12px and 16px; inside controls 8px.

Density changes with width, function does not. Under 1024px count tiles go from four across to two across and the disc field goes from two rows of 50 to four rows of 25. Filter forms stack. On the live board the filters sit in a card on narrow screens and directly on the ground from 1024px, so the list starts higher. Tables scroll sideways inside their frame, and under 640px their cells never wrap. Button and chrome labels may collapse to an icon with a screen-reader label under 640px.

Touch size follows the screen. Under 640px every button, field and small pill is at least 44px tall (chrome buttons are also at least 44px wide). From 640px buttons and fields are 40px and small pills 36px.

## Elevation & Depth

The system is nearly flat. Depth comes from tone: a white card on the misted ground, a faint `primary` tint on the header row of a white table, a hairline border on everything. One shadow exists, and it is barely visible.

### Shadow Vocabulary
- **Card** (`box-shadow: 0 1px 2px rgb(15 42 46 / 0.05)`; in dark `0 1px 2px rgb(0 0 0 / 0.3)`): cards, tables that stand alone, count tiles, the sign-in form.
- **Scroll shade** (a 14px gradient of `rgb(15 42 46 / 0.16)` at an inline edge; in dark `rgb(0 0 0 / 0.55)`): not a lifted surface but a signal. It appears at the edge of a table that has more columns in that direction and fades out when that edge is reached.

### Named Rules
**The Border First Rule.** A surface is defined by its 1px `line` border; the shadow only softens the edge. Nothing lifts on hover. Hover changes the border and the fill.

**The Drifting Ground Rule.** The page ground is never a flat colour. It is the fixed sand-to-sea gradient set on the root element. Do not paint a flat background over it on a page.

## Shapes

Three radii, by job. Cards, tiles and large panels have soft corners (14px). Standalone tables, empty states and skeleton frames are a little tighter (12px). Fields, alerts and menu items are tighter again (9px). Everything that is pressed or that names a state is a full pill: buttons, badges, chrome buttons. The disc itself is a 9px circle (6px inside a badge) with a hairline inset edge (1px, `foreground` at 24%), so the pale hues still read as shapes on any surface. Icons are drawn in one 1.6px stroke with round ends on a 20-unit grid and shown at 16px.

Borders are 1px. A dashed border means "nothing here yet". The current tab is the only place a 2px line is used, as an underline. The focus ring is a 2px `primary` outline with a 2px offset on every focusable element; fields pull it in to sit on the border; inside the rail it turns `rail-dot` so it shows on dark teal.

## Components

### Buttons
Soft and plain: a pill with a word, sometimes a 16px line icon.
- **Shape:** full pill, weight 500, never wraps. Minimum height 44px under 640px, 40px from 640px.
- **Primary:** `primary` fill with `on-primary` text, 8px by 20px padding. One per form or screen, for the main action.
- **Secondary:** `surface` fill, `line-strong` border, `foreground` text, 8px by 16px.
- **Danger:** `surface` fill, `danger` text and a half-strength `danger` border. Used for destructive or rejecting actions.
- **Chrome / small pill:** the smaller pill (0.875rem; at least 44px by 44px under 640px, 36px tall from 640px) with the secondary button's colours. It is used for language, theme and sign-out in the header, and for refresh, pager and period steps inside screens. The language button is marked with the language it switches to. Sign-out hovers in `danger`.
- **Hover / Focus:** primary deepens to `primary-hover`; secondary and chrome take a `primary` border and `primary-soft` fill; danger takes a full `danger` border and `danger-soft` fill. Pressing scales to 98%. Disabled is 60% opacity. Transitions are 160ms on colour, border and opacity with a soft ease-out.

### Chips
- **Badge:** a pill with a 6px disc and a word, 0.75rem at weight 500, soft tint fill with matching ink. Five tones: ok, warn, danger, info, and off (a `surface-2` fill with an inset hairline and a grey disc). Badges are labels, not buttons.

### Cards / Containers
- **Corner Style:** 14px.
- **Background:** `surface`.
- **Shadow Strategy:** the single card shadow (see Elevation).
- **Border:** 1px `line`.
- **Internal Padding:** 16px on phones, 20px from 640px.
- A table placed inside a card runs edge to edge: it drops its own frame and bleeds to the card's sides and bottom.

### Inputs / Fields
- **Style:** `surface-2` fill, 1px `control-line` border, 9px corners, 8px by 12px padding. Minimum height 44px under 640px, 40px from 640px. Label above in 0.875rem weight 500; optional hint below in 0.75rem muted.
- **Hover:** border darkens to `foreground` at 60%.
- **Focus:** border turns `primary`, fill turns `surface`, with the 2px ring on the border.
- **Disabled:** 60% opacity.
- **Select:** the native control with its arrow redrawn in `muted` and placed on the inline end in both directions.
- **Checkbox, radio, range:** native controls in `primary`; checkboxes and radios are 16px. A choice sits in a 9px-cornered row on `surface-2` that is at least 40px tall.
- **Alert:** a 9px box with a 16px circle icon, in `danger` or `ok` ink on its soft tint with a quarter-strength border. Errors are announced as alerts, successes as status.

### Tables
- Framed in `surface` with a `line` border and 12px corners; scrolls sideways when narrow, with the scroll shade at whichever edge has more to show.
- Header row tinted with `primary` at 4%, 0.8125rem weight 500 muted, start-aligned, never wraps.
- Rows 0.875rem with 10px by 16px cells and a hairline between rows; hover tints the row with `primary` at 4%. Under 640px cells never wrap.
- Names are text links: `primary` at weight 500 with a permanent soft underline (`primary` at 30%, 4px below the text) that turns full `primary` on hover. Missing values are an em dash.
- A state inside a table is a disc and a word. Attendance history shows each day's status as a 9px disc in the live board's hue plus the word, with `warn` or `danger` ink on the word for late, absent and missing check-out; the audit log shows each action as a badge.

### Navigation
- **Rail:** `rail` fill. Wordmark in white at display size with a small muted subtitle. Items are 9px-cornered rows in `rail-ink`; hover fills `rail-hover` and turns the text white. The current item fills `rail-on`, turns white at weight 500 and carries one lit 6px `rail-dot` disc before the word, on phones as well as desktop. Items are 0.875rem with 10px vertical padding on phones, 0.9375rem with 8px from 768px. A screen that is not built yet shows as a `rail-muted` item with a small "soon" pill.
- **Underline tabs:** used inside a section (organisation, reports). A row on a hairline; each tab is 0.875rem muted text with a 2px transparent underline. Hover shows a `line-strong` underline; the current tab is `primary` at weight 500 with a `primary` underline. The row scrolls sideways on phones.
- **Back link:** a muted 0.875rem line with the back arrow before it; hover turns it `primary`.

### Disc Field (signature)
The shift as a field of discs inside a card. It is always exactly 100 discs, one per 1% of scheduled staff, so any day, department or site compares at a glance. Two rows of 50 with a 5px gap from 1024px; four rows of 25 with a 4px gap below that. Discs are grouped by state in a fixed order and coloured with the eight disc hues; with nobody scheduled, all 100 show in `line`. Every disc has the hairline inset edge. When the board refreshes, discs fade to their new colour over 200ms. The field is decorative to assistive technology; the legend under it carries the same information as a disc, a word and a percentage for each state.

### Count Tile (signature)
A link styled as a small card (14px corners, card shadow, 12px padding, 16px at the sides from 640px): a disc and the state's name in muted 0.875rem, then the count at 1.75rem weight 600 in tabular numerals, then an optional hint (hidden on phones). A count above zero for late, absent or not-arrived takes its `warn` or `danger` ink. The selected tile has a `primary` border plus a 1px `primary` ring and a `primary-soft` fill. Tiles sit four across from 1024px and two across below, with a 10px to 12px gap. The employee dashboard uses the same anatomy for its monthly figures (label in muted 0.875rem, figure at 1.75rem weight 600, `danger` ink for a bad figure), as plain tiles that are not links.

### Disc Sphere
The identity's one picture: a sphere built from a 19 by 19 grid of small discs in eight fixed sea hues, in slanted bands like the towers' sequins. It appears in one place: large and cropped at the bottom inline-end corner of the brand panel of the sign-in and change-password screens, which shows from 1024px. It is a picture, not a logo: it never sits beside the wordmark and is never used as a badge or an icon. It is decoration only and always sits on rail teal.

### Icons
One small set, drawn in the same single stroke: back, previous, next, check and plus, each 16px and in the colour of the text beside it. Back, previous and next follow the reading direction, so they mirror in Arabic. Icons are decoration to assistive technology; the word beside them carries the meaning.

### Map
The map sits in a 12px-cornered frame with a `line` border and is its own stacking layer. In dark mode its tiles are dimmed and its controls take the panel's surfaces. Its overlay colours are fixed and exempt from the token rule: red is danger and green is safe.

### Empty, Loading and Error
- **Empty:** a dashed `line-strong` box with 12px corners, three grey discs at rest and one calm sentence in muted 0.875rem.
- **Loading:** skeleton blocks in the shape of the screen (title, a band, seven table rows). The skeleton is a slow 1.4s sliding tint between `line` and `surface-2`. Only screens that can never redirect or answer "not found" have it (live board, approvals, reports), because a streamed loading state fixes the page's status at 200; there is no panel-wide loading state.
- **Error:** a `danger-soft` panel with a `danger` title, one plain sentence and a secondary "retry" button.
- **Not found:** centred on the ground: the headline, one muted sentence and a primary button back to the home screen.

## Do's and Don'ts

### Do:
- **Do** show every state as a disc plus a word, using the `Badge` tones or the eight disc hues.
- **Do** keep the disc field at exactly 100 discs.
- **Do** use the tokens (`primary`, `surface`, `line`, and so on) so light and dark both work.
- **Do** use logical properties (inline start and end) so Arabic and English are both correct, and wrap file numbers, times and percentages left-to-right with tabular numerals.
- **Do** format Arabic dates and numbers with Latin digits (`ar-KW-u-nu-latn`) and show every time of day in the one 24-hour form.
- **Do** give each screen one headline (1.5rem, weight 700) and one primary pill button for the main action.
- **Do** keep every control at least 44px tall under 640px (40px for buttons and fields and 36px for small pills from 640px), and keep the 2px `primary` focus ring visible.
- **Do** put tables inside the shared table frame, and let a table inside a card run edge to edge.
- **Do** give an input the `control-line` edge; `line` is for surfaces, not for controls.
- **Do** use the shared icon set, and let back, previous and next mirror in Arabic.
- **Do** add a loading skeleton only to a screen that can never redirect or answer "not found".
- **Do** keep transitions to colour, border and opacity at 160ms with the soft ease-out, and honour reduced motion.

### Don't:
- **Don't** bring back navy or gold in the panel; the owner retired that identity for the panel on 2026-11-17.
- **Don't** build a grey shell with a single blue accent.
- **Don't** show state with colour alone, and don't reuse a disc hue for decoration or a different meaning.
- **Don't** write raw hex colours in a screen. The disc sphere and the emergency map are the only exemptions.
- **Don't** change the emergency map's red and green; their safety meaning is fixed.
- **Don't** paint a flat background over the drifting ground, or lift surfaces with heavier shadows on hover.
- **Don't** add a second typeface, or make table text bigger to show importance.
- **Don't** add page-load animation or moving decoration.
- **Don't** invent a logo or official illustration; the wordmark is the name set in type until the owner approves a final logo.
- **Don't** use the disc sphere as a logo, a badge or an icon, or place it beside the wordmark; it is the sign-in picture only.
- **Don't** use a typed character (a plus sign, an arrow) where the icon set has a drawn icon.
