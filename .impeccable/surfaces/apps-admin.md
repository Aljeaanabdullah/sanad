---
version: 1
slug: "apps-admin"
primary_target: "apps/admin"
related_targets: []
---

# Surface brief: admin panel (apps/admin)

Scope: the whole web panel: sign-in, change-password, and every page under `(panel)`. Visitor mode: Operate.

Audience and job: supervisors, HR and the system admin of one Kuwaiti company, on desktop and phone about equally. They read today's shift at a glance, decide on requests, read records and reports, manage employees and the organisation, and run an emergency evacuation. All four daily areas matter equally.

Constraints: no change to functions, data, Supabase logic, copy meaning, exports, or `data-testid` hooks. Arabic (RTL) first, English (LTR) second. Light and dark. Emergency map keeps red and green. Mobile app is out of scope and moves to this identity later.

Owner decision 2026-11-17: direction "زجاج البحر" (sea glass) chosen from four sketches; plan approved, including the PRD section 12 update.

## Direction contract

THESIS: The shift is a field of enamel discs. Sanad's panel takes its colour from the Kuwait Towers' sea-glass spheres and shows a day's attendance the way the towers show the Gulf: many small discs, read as one state. It refuses the grey admin shell with one blue accent.

OWN-WORLD: Deep sea-teal rail and primary; misted sea ground that drifts from warm sand at one corner to cool green at the other; white surfaces with soft 14px corners; pill buttons. Eight enamel status hues (sea green, amber, coral, deep red, grey-blue, pale grey, deep blue, teal), each always paired with a word. One soft rounded Arabic and Latin face, tabular numerals. Dark theme is the Gulf at night: deep blue-green ground, turquoise primary.

STORY: The visitor sees the state of the day before reading a number, opens the group that needs them, and decides. Every screen keeps the same vocabulary, so nothing has to be relearned.

FIRST VIEWPORT (live board, 1440): coloured rail on the inline start with the wordmark and role menu; header with name, role, language, theme, sign out; page title with last-updated time and refresh; a full-width disc field (100 discs, one per 1% of scheduled staff, with legend); filters; eight count tiles with the selected one outlined; the list table. On phones the rail becomes a top bar with a scrolling menu, the disc field becomes 4 rows of 25, tiles go two-up, and tables shed secondary columns or scroll.

Signature interaction: the disc field. Motion grammar: 150–200 ms ease-out state transitions only; discs fade their colour when the board refreshes; no page-load choreography; reduced motion removes it.

Raises: fixed scale (from the botanical folio): the field is always 100 discs so any day, department or site compares. Drifting ground (from the design annual): the ground is never flat grey. State stays on the record (from the ticket wallet): decisions show as a disc and a word in a fixed place. Rank by weight (from the timetable): one size inside tables; hierarchy by weight and colour. Thumb reach (from the vertical feed): on phones, decision actions sit full-width under the request.

FORM: Kuwait Towers enamel-disc sea glass, position 4 of 7 on the ordered list; seed:0a2b1cdb2917b47d.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Unresolved: final logo (wordmark in type until the owner approves one).
