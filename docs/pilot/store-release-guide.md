# دليل نشر تطبيق سَنَد للتجربة الداخلية

| البند | القيمة |
|---|---|
| المرحلة | 13 — التجربة والإطلاق |
| لمن | المالك (خطوة بخطوة، بدون برمجة) |
| الهدف | توزيع التطبيق **داخلياً** على موظفي التجربة: Android عن طريق Google Play (اختبار داخلي) أو ملف APK، وiPhone عن طريق TestFlight |
| الملفات | `apps/mobile/eas.json` (إعدادات البناء)، و`apps/mobile/scripts/eas-google-services.mjs` (ملف Firebase وقت البناء) |

> 🔒 **قاعدة:** لا تكتب أي كلمة سر أو مفتاح في GitHub أو في المحادثة. الأسرار تُحفظ فقط في المواقع المذكورة في القسم 3 (expo.dev وGoogle Play وApple وSupabase).
>
> هذا الدليل **ما يشتري ولا يرفع شي**. كل خطوة فيها دفع أو رفع تسويها أنت بنفسك.

---

## 1. الصورة باختصار

```
الكود (GitHub)  →  EAS Build في expo.dev يبني التطبيق  →  Google Play (اختبار داخلي)  →  جوالات الموظفين (Android)
                                                    →  TestFlight من Apple          →  جوالات الموظفين (iPhone)
                                                    →  رابط APK مباشر (بدون متجر)    →  جوالات التجربة (Android)
```

في `eas.json` نوعين من البناء:

| الاسم | شنو يطلع | متى نستخدمه |
|---|---|---|
| `pilot-apk` | ملف **APK** لـ Android، ورابط تثبيت مباشر | التجربة السريعة بدون متجر. الموظف يفتح الرابط ويثبّت |
| `testers` | ملف **AAB** لـ Google Play، وبناء iPhone لـ TestFlight | التوزيع الداخلي الرسمي من المتاجر. رقم البناء يزيد تلقائياً كل مرة |

---

## 2. الحسابات اللي تحتاجها

سوّها بهذا الترتيب. اكتب في الجدول تحت لما تخلص كل وحدة.

| # | الحساب | التكلفة (تقريبية) | ليش نحتاجه | تم؟ |
|---|---|---|---|---|
| 1 | **Expo** (expo.dev) | مجاني (الخطة المجانية فيها عدد بناءات محدود كل شهر، وتنتظر بالدور) | يبني التطبيق ويحفظ مفاتيح التوقيع | ☐ |
| 2 | **Google Play Console** | 25 دولار مرة وحدة | نشر Android (اختبار داخلي) | ☐ |
| 3 | **Apple Developer Program** | 99 دولار كل سنة | iPhone و TestFlight (واختياري لاحقاً: App Attest وتنبيهات الطوارئ الحرجة) | ☐ |

### 2.1 Expo
1. افتح expo.dev واضغط **Sign up**. استخدم إيميل الشركة (مو إيميل شخصي) عشان الحساب يبقى للشركة.
2. فعّل **التحقق بخطوتين** (Two-factor) من إعدادات الحساب.
3. (اختياري) سوّ **Organization** باسم الشركة، وخلّ المشروع تحتها.

### 2.2 Google Play Console
1. افتح play.google.com/console وسجّل بحساب Google الخاص بالشركة.
2. اختر نوع الحساب **Organization** (منظمة). يطلب منك **رقم D-U-N-S** للشركة (مجاني، يطلع من موقع Dun & Bradstreet، وممكن ياخذ أيام). إذا ما عندكم، اطلبه بدري.
3. ادفع الرسوم (25 دولار) وكمّل التحقق من الهوية.
4. بعد الموافقة: **Create app** → الاسم «سَنَد» → النوع App → مجاني.
5. في صفحة التطبيق، عبّي الأقسام المطلوبة: **سياسة الخصوصية** (رابط صفحة عامة)، و**Data safety** (نجمع: الموقع وقت التبصيم والطوارئ فقط، وصورة المراجعة، ولا نرسل بصمة الوجه أو الإصبع؛ تبقى في الجوال)، والفئة العمرية، والإعلانات (لا يوجد).
6. لا ترفع شي الحين. الرفع في القسم 4.

> ملاحظة: مسار **Internal testing** (اختبار داخلي) ما يحتاج مراجعة طويلة من Google، ويقبل لين 100 مختبر بإيميلاتهم.

### 2.3 Apple Developer Program
1. على جهاز Apple أو من developer.apple.com: سجّل بـ **Apple ID خاص بالشركة**، وفعّل التحقق بخطوتين.
2. اختر **Organization** (يحتاج نفس رقم D-U-N-S، واسم الشركة القانوني، وموقعها).
3. ادفع الاشتراك (99 دولار سنوياً). الموافقة ممكن تاخذ من يوم لأسبوعين.
4. بعد الموافقة افتح **App Store Connect** → **Apps** → **+** → New App:
   - الاسم: سَنَد، المنصة: iOS، اللغة الأساسية: العربية.
   - **Bundle ID:** `com.sanad.hr` (انظر القسم 5 إذا كان مأخوذ).
5. من **Users and Access** → **Integrations** → **App Store Connect API**: سوّ مفتاح بصلاحية **App Manager**. نزّل ملف المفتاح (`.p8`) مرة وحدة واحفظه في مكان آمن. (EAS يطلبه وقت الرفع، أو يسويه بنفسه لو سجلت دخول بـ Apple ID.)

> TestFlight الداخلي: لين 100 شخص من فريق الشركة في App Store Connect، وبدون مراجعة Apple. الخارجي (لين 10,000) يحتاج مراجعة بسيطة.

---

## 3. الأسرار المطلوبة (الأسماء فقط)

كل سر مكانه محدد. **لا تحطه في مكان ثاني.**

### 3.1 في expo.dev (المشروع ← Environment variables)
| الاسم | شنو فيه | النوع | ملاحظة |
|---|---|---|---|
| `GOOGLE_SERVICES_JSON` | ملف Firebase للتطبيق `com.sanad.hr` (نفس اللي في أسرار GitHub) | **File** أو نص (JSON أو base64)، والظهور **Secret** | بدونه التطبيق يشتغل، بس ما توصله الإشعارات. سكربت `eas-google-services.mjs` يكتبه وقت البناء |

### 3.2 في expo.dev (المشروع ← Credentials) — EAS يسويها ويحفظها
| الاسم | شنو | ملاحظة |
|---|---|---|
| Android Keystore | مفتاح توقيع تطبيق Android | خلّ EAS يسويه أول بناء. **نزّل نسخة احتياطية** منه واحفظها في مكان آمن خارج GitHub |
| Google Service Account Key | ملف JSON من Google Cloud يسمح لـ EAS يرفع لـ Google Play | يُرفع في Credentials ← Android ← Google Service Account. خطوات إنشائه في القسم 4.3 |
| Apple Distribution Certificate وProvisioning Profile | شهادات iPhone | EAS يسويها لما تسجّل دخول Apple وقت أول بناء |
| App Store Connect API Key | الملف `.p8` مع **Key ID** و**Issuer ID** | للرفع لـ TestFlight بدون كلمة سر Apple |

### 3.3 في GitHub (Settings ← Secrets and variables ← Actions) — اختياري
| الاسم | ليش |
|---|---|
| `EXPO_TOKEN` | فقط إذا حبّينا لاحقاً نبني من GitHub Actions بدل جهازك. يُسوّى من expo.dev ← Access tokens |
| `GOOGLE_SERVICES_JSON` | **موجود من قبل** (لبناء APK في CI). لا تغيّره |

### 3.4 في Supabase (Edge Functions ← Secrets) — بعد أول بناء حقيقي
| الاسم | شنو فيه |
|---|---|
| `ANDROID_SIGNING_CERT_SHA256` | بصمة SHA-256 لمفتاح توقيع التطبيق، **أكثر من وحدة مفصولة بفاصلة**: (1) بصمة مفتاح EAS (من expo.dev ← Credentials ← Android) لملف `pilot-apk`، و(2) بصمة **App signing key** من Google Play Console ← Test and release ← App integrity، لأن Google يعيد توقيع التطبيق اللي ينزل من المتجر |

> بعد ما تحط البصمة، الخادم يرفض أي نسخة معدّلة من التطبيق (تقرير الجاهزية، البند 8). جرّب تبصيمة وحدة بعدها من كل نوع (APK والمتجر) قبل ما تعمم.

---

## 4. البناء والرفع خطوة بخطوة

### 4.1 تجهيز جهازك (مرة وحدة)
1. ثبّت **Node.js** (نسخة 24) من nodejs.org.
2. افتح الطرفية (Terminal أو PowerShell) واكتب:
   ```bash
   npm install -g eas-cli
   ```
   ```bash
   eas login
   ```
3. نزّل الكود من GitHub (أو `git pull` إذا عندك نسخة)، وادخل مجلد التطبيق:
   ```bash
   cd apps/mobile
   ```
   ```bash
   npm ci
   ```
4. اربط المشروع بـ Expo (مرة وحدة):
   ```bash
   eas init
   ```
   ⚠️ هذا الأمر **يضيف سطر `projectId` في `app.json`**. سوّه **بعد** دمج جلسة ألوان التطبيق (sea glass) عشان ما يصير تعارض، وارفع التغيير في فرع وطلب دمج عادي.

### 4.2 Android — رابط APK للتجربة (أسرع طريق)
```bash
eas build --platform android --profile pilot-apk
```
- أول مرة يسألك: «Generate a new Android Keystore?» → **Yes**.
- بعد ما يخلص (10 إلى 30 دقيقة)، يعطيك **رابط ورمز QR**. أرسل الرابط للمشاركين برسالة خاصة.
- على جوال الموظف: افتح الرابط ← تنزيل ← اسمح بالتثبيت من هذا المصدر ← تثبيت.
- بعدها حط بصمة المفتاح في Supabase (القسم 3.4).

### 4.3 Android — Google Play (اختبار داخلي)
1. ابنِ ملف المتجر:
   ```bash
   eas build --platform android --profile testers
   ```
2. **أول مرة فقط (يدوي):** نزّل ملف `.aab` من صفحة البناء في expo.dev، وفي Play Console: **Test and release ← Testing ← Internal testing ← Create new release ← ارفع الملف**. Google ما يسمح بالرفع الآلي قبل أول رفع يدوي.
3. في نفس الصفحة: **Testers** ← سوّ قائمة بإيميلات Google للمشاركين ← احفظ ← انسخ **رابط الاشتراك** (opt-in link) وأرسله لهم.
4. **للرفعات الجاية (آلي):**
   - في Google Cloud Console: سوّ **Service account** ونزّل مفتاحه JSON، وفي Play Console ← Users and permissions ادعُه بصلاحية الإصدارات.
   - ارفع ملف المفتاح في expo.dev ← Credentials ← Android ← Google Service Account (لا تحطه في GitHub).
   - بعدها كل إصدار جديد:
     ```bash
     eas build --platform android --profile testers
     ```
     ```bash
     eas submit --platform android --profile testers --latest
     ```
   - الإصدار يوصل للاختبار الداخلي كـ **مسودة** (draft). افتح Play Console واضغط **Roll out** لما تكون جاهز.

### 4.4 iPhone — TestFlight
1. ابنِ نسخة iPhone:
   ```bash
   eas build --platform ios --profile testers
   ```
   - يسألك تسجّل دخول Apple، ويسوي الشهادات بنفسه → وافق.
2. ارفعها لـ TestFlight:
   ```bash
   eas submit --platform ios --profile testers --latest
   ```
3. في App Store Connect ← التطبيق ← **TestFlight**:
   - أول مرة يسأل عن **التشفير (Export Compliance)** → التطبيق يستخدم HTTPS العادي فقط → «None of the algorithms mentioned above» (انظر القسم 5 لإضافة سطر يلغي هذا السؤال).
   - **Internal Testing** ← سوّ مجموعة ← أضف المشاركين (لازم يكونون مضافين في Users and Access).
4. كل موظف ينزّل تطبيق **TestFlight** من App Store، ويفتح الدعوة من إيميله.

### 4.5 بعد كل بناء جديد (فحص سريع)
- [ ] تسجيل الدخول برقم الملف، وتغيير كلمة المرور، وربط الجوال.
- [ ] تبصيمة حضور في الموقع، وتظهر في لوحة الويب.
- [ ] إشعار تجريبي يوصل والتطبيق مغلق (Android).
- [ ] صفحة الموظف في الويب: «مفتاح التبصيم: موثّق من Google» (Android).

---

## 5. تغييرات مطلوبة في `app.json` (لم تُعدَّل الآن)

جلسة ثانية تعدّل ألوان التطبيق و`app.json` الحين، فما لمسناه. هذي التعديلات تُسوّى **بعد دمج جلسة الألوان**، في طلب دمج صغير:

| # | التعديل | ليش | ضروري؟ |
|---|---|---|---|
| 1 | `expo.extra.eas.projectId` (و`expo.owner` إذا استخدمت Organization) | يربط التطبيق بمشروع expo.dev. **`eas init` يضيفه تلقائياً** | نعم، قبل أول بناء |
| 2 | التأكد إن `com.sanad.hr` (في `ios.bundleIdentifier` و`android.package`) متاح في App Store وGoogle Play | المعرّف لازم يكون فريد عالمياً، وما يتغير بعد أول نشر. إذا مأخوذ: نختار مثل `com.<اسم-الشركة>.sanad` ونغيّره في **6 أماكن**: `app.json` (مرتين)، وتطبيق Firebase وملف `google-services.json`، وفحص CI في `.github/workflows/ci.yml`، والسكربت `scripts/eas-google-services.mjs`، والسر `ANDROID_PACKAGE_NAME` في دالة device-key | نعم، تأكد قبل إنشاء التطبيق في المتاجر |
| 3 | `"ios": { "config": { "usesNonExemptEncryption": false } }` | يلغي سؤال التشفير في كل رفع لـ TestFlight | مستحسن |
| 4 | رقم الإصدار `version` (الحين `1.0.0`) | يتغير يدوياً لما نطلق إصدار جديد للموظفين (مثل `1.0.1`). **رقم البناء** (versionCode / buildNumber) ما يحتاج تعديل: EAS يزيده تلقائياً (`appVersionSource: remote` و`autoIncrement`) | عند كل إصدار |
| 5 | أيقونة التطبيق وشاشة البداية | تُحدَّث مع ألوان sea glass الجديدة | مع جلسة الألوان |
| 6 | إشعارات iPhone: `ios.googleServicesFile` (ملف `GoogleService-Info.plist`) ومفتاح **APNs** في Firebase | الإشعارات الحين مربوطة لـ Android فقط. iPhone يحتاج هذا بعد حساب Apple | لاحقاً، مهمة منفصلة |

---

## 6. مشاكل متوقعة وحلها

| المشكلة | الحل |
|---|---|
| البناء ينتظر وقت طويل في expo.dev | الخطة المجانية تنتظر بالدور. جرّب وقت ثاني، أو الخطة المدفوعة وقت الإطلاق فقط |
| «Package name already exists» في Google Play | المعرّف مأخوذ. انظر القسم 5، البند 2 |
| `eas submit` يرفض في Android أول مرة | لازم أول رفع يكون يدوي (القسم 4.3، الخطوة 2) |
| بعد التحديث من المتجر، الخادم يرفض التبصيم بسبب «مفتاح التطبيق» | بصمة **App signing key** من Play Console ناقصة في `ANDROID_SIGNING_CERT_SHA256` (القسم 3.4) |
| الإشعارات ما توصل في نسخة EAS | تأكد إن `GOOGLE_SERVICES_JSON` موجود في expo.dev (القسم 3.1)، وفي سجل البناء يطلع سطر «google-services.json written for com.sanad.hr» |
| ضاع مفتاح Android Keystore | لا يمكن تحديث التطبيق في المتجر بدونه (إلا عن طريق دعم Google). لهذا **النسخة الاحتياطية** في القسم 3.2 مهمة |

---

## 7. شنو جاهز وشنو باقي

- ✅ `eas.json` بنوعين: `pilot-apk` و`testers` (لم يُجرَّب البناء على expo.dev بعد؛ يحتاج حساب Expo).
- ✅ سكربت Firebase وقت البناء (`eas-build-pre-install`)، مجرَّب على جهاز التطوير.
- ⬜ الحسابات الثلاثة (القسم 2) — عند المالك.
- ⬜ تعديلات `app.json` (القسم 5) — بعد دمج جلسة الألوان.
- ⬜ بصمات المفاتيح في Supabase (القسم 3.4) — بعد أول بناء.
