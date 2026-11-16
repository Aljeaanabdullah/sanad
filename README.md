# سَنَد (SANAD) — نظام الموارد البشرية

نظام موارد بشرية لشركة واحدة في الكويت: تسجيل الحضور والانصراف من الجوال (Face ID أو البصمة مع التحقق من الموقع)، والإجازات، والعقوبات، وكشف المكافأة الشهري الذي يجهزه وكلاء ذكاء اصطناعي، ولوحة للموظف، ووحدة طوارئ لإخلاء المباني.

- الرابط المباشر للوحة التحكم: https://sanad-ten-alpha.vercel.app
- المتطلبات: [docs/PRD.md](docs/PRD.md)
- خطة التنفيذ: [docs/PLAN.md](docs/PLAN.md)

## هيكل المستودع

| المجلد | المحتوى |
|---|---|
| `apps/mobile` | تطبيق الجوال (Expo / React Native) لـ iOS وAndroid |
| `apps/admin` | لوحة التحكم (Next.js) |
| `supabase/` | إعدادات قاعدة البيانات والجداول والدوال |
| `docs/` | الوثائق |

## المتطلبات على الجهاز

- **Node.js** الإصدار 24 أو أحدث
- **Android Studio**: لتشغيل محاكي Android، أو جوال Android عليه تطبيق Expo Go

## التشغيل

### لوحة التحكم
```bash
cd apps/admin
npm install
npm run dev
```
ثم افتح http://localhost:3000

### تطبيق الجوال
```bash
cd apps/mobile
npm install
npm run android
```

اختبارات تطبيق الجوال:
```bash
cd apps/mobile
npm run typecheck
npm test
```

ملف تثبيت Android (APK) يُبنى تلقائياً في GitHub Actions، وتنزّله من قسم «Artifacts» في صفحة التشغيل.

## نموذج الوجه

لوحة التحكم تسجل وجه الموظف بنموذج يعمل داخل المتصفح. طريقة بنائه واختباره في [tools/face-model/README.md](tools/face-model/README.md).

## الإعدادات

انسخ `.env.example` إلى `apps/admin/.env.local` وضع فيه المفاتيح. **لا ترفع ملفات المفاتيح إلى GitHub أبداً.**

## البيانات الوهمية واختبارات الصلاحيات

تحتاج المفتاح السري في `apps/admin/.env.local`.

```bash
cd supabase/scripts
npm install
npm run demo:seed
npm run test:rls
npm run demo:reset
```

- `demo:seed`: ينشئ 3,500 موظف وهمي وحسابات دخول تجريبية، وكلمات المرور تُحفظ في `supabase/scripts/.demo-credentials.json` (لا يُرفع إلى GitHub).
- `test:rls`: يختبر صلاحيات كل دور.
- `demo:reset`: يحذف البيانات الوهمية، ويُبقي حساب مدير النظام 735043.

## اختبارات لوحة التحكم

```bash
cd apps/admin
npm test          # اختبارات قواعد الإدخال
npm run test:e2e  # اختبارات المتصفح (Playwright)، تحتاج المفتاح السري
```

اختبارات المتصفح تنشئ حسابات مؤقتة (799901–799903) بكلمات مرور عشوائية لا تُعرض، وتحذفها مع كل ما أنشأته عند الانتهاء.

## الفحص الآلي

مع كل Pull Request يشغّل GitHub الفحوصات التالية:
- لوحة التحكم: فحص الكود، واختبارات قواعد الإدخال، والبناء.
- تطبيق الجوال: فحص الأنواع (TypeScript)، والاختبارات، وبناء حزمة Android.
- ملف تثبيت Android (APK) جاهز للتنزيل من «Artifacts».
- اختبارات دالة التبصيم على الخادم.
- البحث عن أي مفاتيح سرية داخل المستودع.
