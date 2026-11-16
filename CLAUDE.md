# Sanad (سَنَد)

HR app for one company in Kuwait: punch in/out by face (with liveness) + GPS geofence, leaves, penalties, monthly bonus lists (prepared by AI agents on OpenClaw), an employee dashboard, and an emergency evacuation module. Data lives in Supabase (Notion is no longer used). Bonus tables and agent RPCs are used by the agents: coordinate before changing them.

- Requirements: [docs/PRD.md](docs/PRD.md)
- Phases and checks: [docs/PLAN.md](docs/PLAN.md)
- Talk to the user in Arabic, in simple words. The UI is Arabic + English.

## Stack and folders
- `apps/mobile` — Expo (React Native + TypeScript + Expo Router), iOS + Android (owner decision 2026-11-16). Punch verification: device Face ID / fingerprint (expo-local-authentication) + a review photo (PRD 4.6). The server still accepts the old face-descriptor path.
- `apps/admin` — Next.js web panel. Face enrollment uses the same dlib ResNet weights in the browser (face-api.js). Consent is given in the mobile app only.
- `supabase/` — Supabase project ref `etaetoflotynlmgrehuu` (eu-central-1; its dashboard name is still the old one, `jahez`): Postgres, RLS, Auth, Storage, Edge Functions, cron.
- `docs/` — PRD and plan. Push notifications: FCM.
- Maps: OpenStreetMap now (Leaflet on the web; react-native-maps or a WebView map on the phone) behind one map interface, to switch to Google Maps later. Test on Android first (dev machine is Windows).

## How to work
1. One phase at a time, in the order of docs/PLAN.md. Nothing outside the current phase.
2. Plan before you build, and get the user's OK.
3. Each phase on its own branch `phase-XX-name`. Open a PR; merge to `main` and tag `v0.XX` only after the user's explicit approval.
4. After each phase: run every "فحص Claude" check and report results honestly (failures included), explain the changes in simple words, commit and push, then tick the phase in the PLAN.md tracking table.
5. Never change docs/PRD.md without asking the user. If requirements change, update PRD.md first, then the code.

## Rules from the plan
- Old internal names kept on purpose (renaming breaks things): sign-in e-mails `<file>@jahez.local`, the phone key `jahez_device_id`, the Supabase dashboard name `jahez`, and applied migrations.
- Employee ID is the file number (رقم الملف الوظيفي). Use dummy data only until the user says otherwise: 3,500 random employees numbered 710000–713499; system admin is 735043. The admin assigns HR roles and types every initial password (same rules; changed on first login).
- Validate every punch on the server: server time, geofence of a site enabled for that employee, bound device, device Face ID / fingerprint + review photo (PRD 4.6; the old face match + liveness path is still accepted). Reject mock location and root/jailbreak; VPN is recorded only (PRD 1.11). Device-biometric punches are signed by a biometric-bound key on the bound phone (PRD 4.7). Punching needs internet.
- Read location only at punch time and during an active emergency. No background tracking.
- Face data needs recorded consent first. Face embeddings are readable by no client role; enrollment photos (bucket `face-enrollment-photos`) are viewable by the admin only. Punch photos auto-delete after 3 months. Termination = export full record (Excel + PDF), then delete everything except the audit log (owner decision).
- Every table has RLS for the 4 roles (employee, supervisor, HR, admin). No secrets in the repo; use `.env.example`.
- Prefer free services. Design: Sanad identity, navy + gold (owner decision 2026-11-16), light/dark theme, RTL-correct.
