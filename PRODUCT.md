# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The web panel (`apps/admin`) serves three staff roles of one company in Kuwait (docs/PRD.md section 2):

- **Supervisor (مشرف):** watches who arrived, who is late and who is absent in their department; gives the first approval on their employees' requests; reads any employee's punches and records; opens the emergency board.
- **HR (موارد بشرية):** enrolls employee faces, gives the final approval on requests, reads records and exports reports.
- **System admin (مدير النظام):** adds, edits and terminates employees; sets passwords and HR roles; manages departments, sites, buildings, work patterns and holidays; launches emergency alerts; reads the audit log.

The panel is opened on desktop computers and on phones about equally (owner answer, 2026-11-17). Employees never use the panel; they use the mobile app.

The owner reads Arabic only. Arabic is the default language; English is the second language.

## Product Purpose

Sanad (سَنَد) is the HR system of one company: about 3,500 employees across 6 sites. Employees punch in and out from their own phone, verified by face and by GPS geofence. The panel is where staff follow attendance live, decide on requests, read records and reports, manage the organisation, and run an emergency evacuation. Success for the panel: a supervisor sees the state of today's shift at a glance, and a decision (approve, reject, correct) takes seconds.

## Positioning

One system that joins verified attendance (face + geofence + bound device), leaves and penalties, the monthly bonus list prepared by AI agents, and an emergency evacuation module with headcount, for one company, in Arabic first.

## Operating Context

- Daily screens, all four equally important (owner answer, 2026-11-17): the live board, approvals, records and reports, employees and organisation.
- The live board refreshes itself every 30 seconds and is read at a glance, often repeatedly through a shift.
- The emergency board is used under stress, possibly on a phone, during a fire or gas leak. Its map uses red and green for unsafe and safe; that meaning is fixed (PRD section 12).
- Tables are dense: file number, name, department, shift time, check-in, late minutes, check-out, site. File numbers and times are always shown left-to-right.
- Exports go to Excel and PDF.

## Capabilities and Constraints

- Next.js web panel, Tailwind CSS, server-rendered pages with plain forms (language and theme switches work without client JavaScript; preferences live in cookies).
- Arabic (RTL) and English (LTR); light and dark theme chosen by the user.
- Menu depends on the role (PRD section 2).
- Data and rules live in Supabase; the panel does not change data rules.
- Sign-in is by 6-digit file number and password; no self-registration.
- Dummy data only until the owner says otherwise.

## Brand Commitments

- Name: سَنَد (Sanad). The wordmark is the Arabic name set in type; the logo is temporary until a final one is approved (PRD section 12).
- The navy + gold identity (owner decision 2026-11-16) is retired for the panel by the owner's decision of 2026-11-17: a new identity, professional and soft, at the level of global product companies.
- The mobile app keeps navy + gold for now and will move to the new identity later, in a separate task (owner answer, 2026-11-17).
- Emergency map: red and green keep their safety meaning.
- Voice: simple, direct words. No marketing language inside the panel.

## Evidence on Hand

- Requirements: docs/PRD.md. Phases: docs/PLAN.md.
- The running panel: https://sanad-ten-alpha.vercel.app
- No final logo, no brand illustrations, no photography. None may be invented as if official.

## Product Principles

1. The state of today is readable at a glance: counts first, lists second.
2. A decision takes one screen: the facts needed to approve or reject sit next to the buttons.
3. Arabic first, in both directions correct: numbers, times and file numbers never flip.
4. The same screen works on a phone and on a desktop, with no loss of function.
5. Colour carries meaning (late, absent, danger, safe), never decoration.

## Accessibility & Inclusion

- Right-to-left and left-to-right both correct.
- Readable contrast in light and dark themes; visible keyboard focus; forms usable without a mouse.
- Status is never shown by colour alone.
