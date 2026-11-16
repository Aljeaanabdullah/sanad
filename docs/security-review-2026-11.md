# المراجعة الأمنية — نوفمبر 2026 (المرحلة 12)

**التاريخ:** 2026-11-16 · **الفرع:** `phase-12-privacy` · **المشروع:** Supabase `etaetoflotynlmgrehuu`

هذا التقرير للمالك. الجزء الأول بالعربي وبكلام بسيط. في الآخر ملحق تقني بالإنجليزي للمبرمجين.

> **ملاحظة:** المراجعة صورة للوضع وقت كتابتها. شغل المراحل 9 و10 و11 وشاشة سجل العمليات كان يجري بنفس الوقت، وجداولهم ودوالهم الجديدة لم تُراجع هنا بالتفصيل (تُراجع عند دمج كل مرحلة).

---

## 1. الخلاصة

- **ما فيه ثغرة خطيرة مفتوحة الآن على بيانات الموظفين.** كل جدول عليه حماية الصفوف (RLS)، وكل دالة حساسة تتحقق من دور المستخدم.
- **لقيت مشكلة واحدة مهمة وأصلحتها في قاعدة البيانات:** أي شخص من الإنترنت يقدر يفتح حساباً جديداً في النظام (التسجيل الذاتي مفتوح)، وكان هذا الحساب يقدر يقرأ أسماء المواقع وإحداثياتها والمباني والأقسام والورديات والعطل. الآن هذه الجداول لا يقرؤها إلا موظف مسجّل. **لكن لازم تقفل التسجيل الذاتي من لوحة Supabase** (الخطوة في القسم 3).
- **أصلحت أيضاً** صلاحيات قديمة كانت معطاة للمستخدمين بشكل افتراضي ولا تستعملها التطبيقات أبداً: TRUNCATE (مسح جدول كامل دفعة وحدة، وتتخطى الحماية) وTRIGGER وREFERENCES. شلتها، وتأكدت أن كل شيء يشتغل مثل قبل.
- **الحذف التلقائي لصور التبصيم بعد 3 أشهر صار جاهزاً**، وجرّبته بصور وهمية قديمة وجديدة: انحذفت القديمة فقط. باقي خطوة وحدة: نشر دالة `purge-punch-photos` (القسم 3).

## 2. جدول النتائج

| # | النتيجة | الخطورة | الحالة |
|---|---|---|---|
| 1 | التسجيل الذاتي مفتوح، وأي حساب جديد كان يقرأ المواقع والمباني والأقسام والورديات والعطل | **عالية** | ✅ أُصلحت القراءة في قاعدة البيانات. ⏳ إقفال التسجيل من اللوحة: **عليك** |
| 2 | فحص كلمات المرور المسرّبة (HaveIBeenPwned) غير مفعّل | متوسطة | ⏳ توصية: فعّله من اللوحة إذا كانت باقتك تسمح |
| 3 | الإعداد الافتراضي في Supabase يعطي كل دالة أو جدول جديد صلاحيات واسعة، فلازم كل مرحلة تتذكر تسحبها | متوسطة | ⏳ توصية: نغيّر الإعداد الافتراضي بعد دمج المراحل الجارية |
| 4 | صلاحيات TRUNCATE وTRIGGER وREFERENCES للمستخدمين على 23 جدولاً (منها سجل العمليات) | منخفضة | ✅ أُصلحت (جداول المكافأة وجداول المراحل الجارية تركتها) |
| 5 | جلسة الدخول في الجوال محفوظة بدون تشفير إضافي | منخفضة | ⏳ توصية |
| 6 | صورة المراجعة تبقى في ذاكرة التطبيق المؤقتة بعد التبصيم | منخفضة | ⏳ توصية |
| 7 | لوحة الويب بدون ترويسات أمان (منع فتحها داخل موقع آخر) | منخفضة | ⏳ توصية قبل نشر اللوحة (المرحلة 13) |
| 8 | إنهاء الخدمة يحذف أول 1000 صورة فقط لكل موظف في كل مخزن | منخفضة | ⏳ توصية |
| 9 | دوال الوكلاء مفتوحة لـ anon | معلومة | مقبول ومقصود: كل دالة تتحقق من رمز الوكيل بنفسها. جرّبت بدون رمز: ترفض أو ترجع لا شيء |
| 10 | المشرف يرى كشوفات المكافأة والإجازات والعقوبات لكل الموظفين | معلومة | قرار لك: الوثيقة تقول المشرف يرى «بصمات أي موظف وسجلاته». إذا تبي المكافأة لقسمه فقط، نرتّبها مع مشروع الوكلاء |

## 3. المطلوب منك (المالك)

1. **اقفل التسجيل الذاتي:** لوحة Supabase ← Authentication ← Sign In / Providers ← أطفئ «Allow new users to sign up». إنشاء الحسابات من لوحة سَنَد يبقى شغالاً (يستعمل صلاحية المدير، لا يحتاج التسجيل الذاتي).
2. **فعّل فحص كلمات المرور المسرّبة:** Authentication ← Passwords ← Leaked password protection (إذا كانت الباقة تسمح).
3. **انشر دالة الحذف التلقائي** (ما قدرت أنشرها من جلستي لأن أداة النشر رفضت الطلب). من جهاز فيه Supabase CLI:
   `supabase functions deploy purge-punch-photos --no-verify-jwt --project-ref etaetoflotynlmgrehuu`
   بعد النشر تشتغل لحالها كل يوم الساعة 1:30 فجراً بتوقيت الكويت.
4. **راجع هذا التقرير** (فحص المالك في المرحلة 12).

## 4. الحذف التلقائي لصور التبصيم (3 أشهر)

**كيف يشتغل:** كل يوم الساعة 1:30 فجراً، مهمة مجدولة في قاعدة البيانات تنادي دالة على الخادم اسمها `purge-punch-photos`. الدالة تسأل قاعدة البيانات عن الصور اللي عمرها أكثر من 3 أشهر، وتحذفها من المخزن بالطريقة الرسمية (Storage API)، ثم تمسح رابط الصورة من سجل التبصيمة. **سجل التبصيمة نفسه يبقى** (الوقت والموقع والنتيجة)، الصورة فقط تنحذف. كل تشغيل يكتب سطراً في سجل العمليات فيه عدد الصور المحذوفة.

**ليش بهالطريقة:** Supabase يمنع حذف الملفات مباشرة من قاعدة البيانات، ولو حذفنا السطر فقط يبقى الملف الحقيقي مخزناً ومدفوع الثمن بدون فائدة. لذلك الحذف يمر عن طريق دالة الخادم.

**الحماية:** الدالة لا تحتاج دخول مستخدم، لكنها تطلب كلمة سر طويلة عشوائية صنعتها داخل قاعدة البيانات ومحفوظة في الخزنة (Vault) فقط، وليست في الكود. لا أحد من الأدوار الأربعة يقدر يشغّل الحذف.

**التجربة:** رفعت 4 صور وهمية حقيقية إلى المخزن مع 4 تبصيمات وهمية: صورتان عمرهما 100 يوم و4 أشهر، وصورتان عمرهما 80 يوماً ويوم واحد. النتيجة: انحذفت الصورتان القديمتان فقط من المخزن (فتحهما بعدها يعطي «غير موجود»)، وانمسح رابطهما من التبصيمتين، والصورتان الجديدتان بقيتا، والصور العشر الحقيقية لم تُلمس. بعدها حذفت كل بيانات التجربة. بقي سطر واحد في سجل العمليات من هذه التجربة (رقم 5488)، لأن سجل العمليات لا يُحذف منه شيء.

**صور تسجيل الوجه:** الوثيقة لا تحدد مدة لحذفها. تقول فقط إنها في مخزن مغلق لا يفتحه إلا مدير النظام، وتُستبدل عند إعادة التسجيل، وتُحذف عند إنهاء الخدمة. لذلك **لم أضع لها حذفاً تلقائياً**. إذا تبي مدة معيّنة، لازم نعدّل الوثيقة أولاً.

## 5. ما راجعته باختصار

- **قاعدة البيانات:** كل الجداول عليها حماية الصفوف، وجرّبت الحسابات الأربعة (موظف، مشرف، موارد بشرية، مدير) وزائراً بدون دخول وحساباً غريباً: كل واحد يرى ما يخصه فقط.
- **دوال الخادم:** كل دالة تتأكد من هوية المستخدم ودوره، وتفحص المدخلات (حجم الصورة، نوعها، الأرقام).
- **الكود في GitHub:** لا توجد مفاتيح سرية. فحص gitleaks يعمل في كل دفعة. المفتاح «العام» (publishable) موجود في تطبيق الجوال وهذا طبيعي، لأنه مصمم ليكون عاماً والحماية من RLS.
- **تطبيق الجوال:** يحفظ في الجوال الجلسة والإعدادات (اللغة والثيم) ومعرّف الجهاز (في المخزن الآمن). يتصل فقط بـ Supabase وبخادم «اسأل سند» التابع للشركة، وكلها HTTPS.
- **لوحة الويب:** كل صفحة وكل إجراء يتحقق من الدور على الخادم، والمفتاح السري مستعمل في الخادم فقط.

---

## Appendix — technical details (English)

### A. Supabase advisors (snapshot 2026-11-16 23:18 UTC)

**Security**

| Lint | Level | Objects | Meaning | Status |
|---|---|---|---|---|
| `auth_leaked_password_protection` | WARN | Auth | HIBP check on new passwords is off | Recommend enabling (dashboard; plan-dependent) |
| `anon_security_definer_function_executable` | WARN | `agent_hire`, `agent_set_status`, `bonus_attendance` | anon can call these SECURITY DEFINER RPCs | **Accepted: agent RPCs, guarded inside by `private.current_agent()`** (bonus_attendance: `is_agent() or is_staff()`). Agents call PostgREST as anon with `x-agent-token`. Verified (rolled back) as anon without a token: `agent_hire` and `agent_set_status` raise `not allowed`, `bonus_attendance` returns 0 rows. Not changed |
| `authenticated_security_definer_function_executable` | WARN | 31 RPCs (`approval_inbox`, `attendance_history`, `submit_request`, …, plus new phase 9/10/11 RPCs) | signed-in users can call them | By design: they are the app API. Each checks `current_employee_id()` / `has_role()` / `can_decide()`; verified for the core ones with a "stranger" JWT (see C). Phase 9/10/11 RPCs to be reviewed at their merge |
| `rls_enabled_no_policy` | INFO | `device_challenges`, `push_tokens` (phase 9) | RLS on, no policy = clients get nothing | Intentional: server-only tables (service role / SECURITY DEFINER RPCs) |

New Phase 12 RPCs (`punch_photo_purge_candidates`, `punch_photo_purge_finish`) do not appear: they are executable by `service_role` only.

**Performance**

| Lint | Objects | Status |
|---|---|---|
| `unindexed_foreign_keys` | `agent_log.employee_id` | Bonus table: left to the agents project (tiny table) |
| `unused_index` | `agent_log_action_idx`, `attendance_punches_shift_date_idx`, `requests_status_idx`, `assistant_log_employee_asked`, `assistant_log_asked` | INFO only; data is small and these match planned queries (reports, filters). Re-check after the pilot |

### B. Fixes applied (each tested in a rolled-back transaction with the 4 test accounts)

| Migration | What | Test |
|---|---|---|
| `20261116231046_punch_photo_retention` | pg_net, Vault secret `punch_photo_purge_secret`, `private.punch_photo_purge_secret_ok`, `public.punch_photo_purge_candidates`, `public.punch_photo_purge_finish`, cron `punch-photos-purge` (`30 22 * * *` UTC) | Rolled back: wrong/null secret rejected (42501); only >3-month objects returned; finish clears only their `photo_path`, writes `audit_log` (`retention_purge`); employee/supervisor/HR/admin/anon all denied EXECUTE. Then live test with real files (section D) |
| `20261116231523_revoke_truncate_from_clients` | `revoke truncate` from anon + authenticated on 23 non-bonus tables | Before: an employee JWT passed the TRUNCATE privilege check (failed later only on an FK). After: TRUNCATE denied for all 4 roles + anon on every table; SELECT counts per role unchanged |
| `20261116232050_revoke_trigger_references_from_clients` | `revoke trigger, references` from anon + authenticated on the same 23 tables | Rolled back with the 4 accounts + anon: per-table SELECT counts unchanged, own `attendance_history`, `employee_dashboard`, `my_notifications` work, admin UPDATE on `sites` works |
| `20261116231807_org_tables_read_employees_only` | `buildings`, `departments`, `public_holidays`, `sites`, `work_patterns`: policy `using (true)` → `using ((select private.current_employee_id()) is not null)` | Before: a JWT for a non-employee user read 3 sites (names + geofences), 5 buildings, 8 departments. After: stranger reads 0 rows everywhere; employee/supervisor/HR/admin row counts unchanged (5/8/6/3/6); agent anon policy on departments untouched |

### C. RLS coverage

All 27 public tables in scope have RLS enabled (none forced; owner is `postgres`, client roles never own tables). Row counts visible per role (before fixes, same after):

| Table | employee | supervisor | HR | admin | anon |
|---|---|---|---|---|---|
| attendance_days | own (14) | all | all | all | agents only |
| attendance_punches | own | all | all | all | denied |
| audit_log | 0 | 0 | 0 | all | denied |
| consents | own | own | all | all | denied |
| devices | own | own | own | all | denied |
| employees | own row | all | all | all | agents only |
| face_templates (no embedding column grant) | 0 | 0 | 0 | all | denied |
| notifications | own | own | own | own | denied |
| punch_security_settings | 0 | 0 | 0 | 1 | denied |
| requests / request_approvals | own | all | all | all | denied |
| bonus_lists / leaves / penalties | own | all | all | all | agents only |
| agent_log | 0 | 0 | all | all | agents only |
| assistant_log | 0 | 0 | 0 | all | denied |
| org tables (sites, buildings, departments, work_patterns, public_holidays) | read | read | read | read + write | denied (departments: agents) |

Writes: only through SECURITY DEFINER RPCs / edge functions, or admin-only policies (org tables, employees, employee_sites, devices delete). Storage: buckets `punch-photos` (SELECT for supervisor + admin) and `face-enrollment-photos` (SELECT for admin), both private, no client INSERT/UPDATE/DELETE policies.

**SECURITY DEFINER functions:** all 41 in `public`/`private` set `search_path = ''`. anon can execute only the three agent RPCs plus `private.current_agent()/is_agent()` (private schema is not exposed by PostgREST). Server-only RPCs (`attendance_apply_punch`, `attendance_finalize`, `consume_device_challenge`, `demo_seed`, `demo_reset`, `face_distance`, `nearest_other_face`, `punch_slot`, `sites_near`) are service_role only.

**Grants to anon:** SELECT on `employees`, `departments`, `attendance_days` and SELECT/INSERT/UPDATE on bonus tables, all gated by `is_agent()` policies. No anon access to anything else.

**Gaps / recommendations**
- (Medium) Default privileges for `postgres` in `public` still grant ALL on new tables and EXECUTE on new functions to anon/authenticated (and functions to PUBLIC). Every new object needs an explicit revoke. Suggest, after phases 9/10/11/12a are merged: `alter default privileges for role postgres in schema public revoke execute on functions from public, anon; … revoke truncate on tables from anon, authenticated;` and re-grant explicitly per function.
- (Low) TRUNCATE / TRIGGER / REFERENCES are still granted on bonus tables (leaves, penalties, bonus_lists, agent_log) and on tables added by phases 9/10/11 — for the agents project / those phases.
- (Info) Supervisors read all bonus lists, leaves and penalties (`is_staff()`); owner to confirm against PRD 2.

### D. Punch-photo retention — design and live test

- Direct `DELETE FROM storage.objects` is blocked (`storage.protect_delete` trigger, error "Use the Storage API instead") and would orphan the S3 file. So: `pg_cron` → `net.http_post` → edge function `purge-punch-photos` (verify_jwt = false) → `rpc('punch_photo_purge_candidates')` → `storage.from('punch-photos').remove(paths)` (≤1000 per call, ≤50 rounds) → `rpc('punch_photo_purge_finish', removed)`.
- Auth: 64-hex random secret generated in-DB into Vault; cron reads it at run time and sends header `x-purge-secret`; both RPCs re-check it against Vault and are granted to service_role only. Not in the repo.
- `finish` counts only paths that are really gone from `storage.objects`, clears `photo_path` for those (and for >3-month punches whose object is missing), keeps the punch rows, inserts one `audit_log` row: `action = 'retention_purge'`, `table_name = 'attendance_punches'`, `record_id = 'punch-photos'`, `new_data = {photos_deleted, punch_paths_cleared, failed, cutoff, rule}`, `actor_user_id = null`.
- Live test (2026-11-16 23:11 UTC): a test-only storage policy for anon limited to a random prefix `zz-retention-test-<24 hex>/` existed for about one minute. Uploaded 4 real JPEG objects through the Storage API, backdated `created_at` (100 days, 4 months, 80 days, 1 day), inserted 4 demo punches (rejected, `is_demo`) pointing at them. `candidates` returned exactly the 2 old paths. Storage API `remove` returned both; downloads then gave `NoSuchKey`, the 2 recent ones still downloaded. `finish` returned `{photos_deleted: 2, punch_paths_cleared: 2, failed: 0}`, the 2 old punches had `photo_path = null`, the 2 recent kept theirs, the 10 real objects and 10 real `photo_path` values untouched. Cleanup: recent test objects removed via the Storage API, policy dropped, test punches deleted. Audit row 5488 remains (audit log is append-only).
- Not yet done: the edge function itself is not deployed (the MCP deploy tool rejected the call in this session). `net.http_post` to its URL currently returns 404, so until it is deployed nothing is deleted and no daily audit row appears. Deploy with `supabase functions deploy purge-punch-photos --no-verify-jwt`. Health check after the first night: `select * from audit_log where action = 'retention_purge' order by id desc;` and `select status_code, content from net._http_response order by id desc limit 5;`.
- Enrollment photos (`face-enrollment-photos`): PRD 4.1 / 11 set no time limit (admin-only, replaced on re-enrollment, deleted at termination). No automatic deletion added.

### E. Edge functions

| Function | Auth | Input validation | Secrets |
|---|---|---|---|
| `punch` | Bearer JWT → `auth.getUser`, active employee; lock-out after failures (429) | JSON shape, JPEG magic + ≤600 KB, GPS accuracy ≤100 m, nonce ≤200, device signature / attestation, server time | service role from runtime env |
| `device-key` | same | nonce length, public key / attestation chain (Android Key Attestation, package + signing digests from env) | env only |
| `enroll-face` | same + role `hr` only | consent required, model version, 3 JPEGs ≤600 KB, same-person + duplicate-face checks | env only |
| `change-password` | same + active employee | 8–72 chars, letter + digit, not the file number | env only |
| `purge-punch-photos` (new) | Vault shared secret header (no user JWT) | secret length 32–256 | env + Vault |

CORS `*` on the user-facing functions is acceptable: they use bearer tokens, not cookies.

### F. Repository

- `.gitignore` covers `.env`, `.env.local`, keystores, Firebase files. `.env.example` has empty secret values.
- CI job `secrets` runs gitleaks on full history; `.gitleaksignore` lists only the publishable key (public by design) from phase S4.
- Manual scan of the tree and history for `sb_secret_…`, JWTs, private keys, AWS/GitHub tokens: nothing found.
- The publishable key is in `apps/mobile/src/lib/config.ts` and `infra/sanad-ask` env: public by design; all data access is gated by RLS.

### G. Mobile app (Expo)

- On the phone: Supabase session (access + refresh token) in AsyncStorage (not encrypted); language/theme in AsyncStorage; device id `jahez_device_id` in SecureStore; device signing key in the platform keystore (biometric-bound).
- Network: HTTPS to Supabase (auth, RPC, edge functions) and to the company "Ask Sanad" relay (checks the user's session via `/auth/v1/user`, daily quota). No cleartext traffic setting.
- Recommendations (Low): keep the session in encrypted storage (SecureStore-wrapped AES key, Supabase "LargeSecureStore" pattern); delete the camera temp file after the punch is sent (`takePictureAsync` output stays in the app cache).

### H. Web panel (Next.js)

- Every page goes through `requireStaff()` / `requireAdmin()`; all 15 organisation actions call `requireAdmin()` via `db()`; employee actions and the export route call `requireAdmin()`; face enrollment requires HR; approvals call `requireStaff()` and the RPC decides. `proxy.ts` only refreshes the session (pages still check).
- `createAdminClient()` (secret key) is in `src/lib/supabase/admin.ts` with `import "server-only"`, used only in server actions / route handlers after `requireAdmin()`.
- Recommendations (Low): add security headers before publishing (CSP `frame-ancestors 'none'` / `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`); paginate the storage listing in `terminateEmployee` (currently first 1000 files per bucket).
