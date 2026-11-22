# مصدر — نظام سندات التسليم (MASDAR Delivery Notes)

نظام ويب يعمل بالكامل على جهازك (بدون إنترنت وبدون خادم) لإنشاء سندات التسليم الرسمية وإدارتها وتعديلها وإعادة طباعتها، مع مطابقة النموذج الرسمي.

## التشغيل

افتح الملف `index.html` بالنقر المزدوج في **Microsoft Edge** أو **Google Chrome**.
لا يحتاج أي تثبيت. استخدم دائماً **نفس المتصفح** على نفس الجهاز، لأن البيانات تُحفظ داخل المتصفح.

> الطباعة: عند فتح التطبيق من الملف مباشرة يفتح المستند في تبويب جديد — اضغط زر الطباعة في عارض PDF أو `Ctrl+P`.

## الصفحات

| الصفحة | الوظيفة |
|---|---|
| الرئيسية | ترحيب، الرقم التالي، عدد السندات، صافي اليوم/الشهر، نشاط 7 أيام، آخر السندات، تذكير النسخ الاحتياطي |
| سند جديد | 4 حقول فقط (السائق، السيارة، الفارغ، القائم) + معاينة مباشرة وحساب الصافي |
| السجل | بحث برقم السند/اسم السائق/رقم السيارة، فلترة بالتاريخ والحالة، فتح أي سند |
| صفحة السند | معاينة PDF، تعديل على نفس السند (نفس الرقم)، طباعة، تنزيل، حذف، سجل التعديلات |
| الإعدادات | الناقل الافتراضي (للسندات الجديدة فقط)، تصدير/استيراد نسخة احتياطية، اللغة، الشاشة الافتتاحية |

## المستند الرسمي (PDF)

- يُنشأ من **ملف PDF الأصلي نفسه** (`documents/original-template.pdf`، مقاس A4 ‏595.35×841.95 نقطة). أُزيلت منه **فقط** النصوص المتغيرة، وكلمة «رقم» بجانب رقم السند، ورمز النموذج `QMS-F-BE-020,Rev.01`، وذلك بحذف حقيقي من محتوى الملف (وليس بتغطيتها بمربعات بيضاء).
- الخطوط والخطوط الفاصلة والشعار والتسميات الثابتة هي كائنات الملف الأصلي نفسها دون أي تعديل.
- تُكتب القيم المتغيرة في نفس الإحداثيات المقاسة من الأصل. نتيجة المقارنة الآلية (`npm run test:pdf`): **617 من 617 حرفاً** من النموذج في نفس الموضع تماماً.
- الخطوط: Helvetica للتاريخ واللوحة والأوزان، وArialMT للرقم والتواريخ، والخط الأصلي **Albany WT J** للأسماء العربية كلما توفرت حروفها في الخط المضمَّن بالنموذج. خط Albany WT J تجاري (Monotype) وغير متاح مجاناً، لذلك تُكتب الأسماء التي تحتاج حروفاً غير موجودة فيه بخط Arial المطابق للمقاسات. إذا حصلت على ملف `AlbanyWTJ.ttf` مرخَّص، ضعه في `assets/fonts/` ثم شغّل `npm run build:template`، وسيُستخدم لكل الأسماء.
- **كل التواريخ في النظام (المستند والموقع) بصيغة واحدة: `DD/MON/YY`** — مثال: `12/NOV/26`، `05/OCT/26`. التاريخ أعلى المستند ووقت الدخول ووقت الخروج كلها تعرض تاريخ تسجيل السند.
- اسم الملف: `DeliveryNote-1211000.pdf`.

## الترقيم `DDMM000`

- اليوم برقمين + الشهر برقمين + تسلسل من 000 يبدأ من جديد كل يوم: ‏`1211000`، `1211001`…
- **لا تكرار أبداً**، وذلك عبر ثلاث طبقات:
  1. العدّاد يُقرأ ويُزاد داخل **نفس المعاملة** (transaction) التي تحفظ السند، فلا يمكن أن يحصل سندان على نفس الرقم حتى لو ضُغط زر الحفظ مرتين أو فُتح التطبيق في أكثر من نافذة.
  2. فهرس فريد (unique) على رقم السند داخل قاعدة البيانات نفسها.
  3. زر الحفظ يُعطَّل أثناء الحفظ.
- حذف سند لا يعيد استخدام رقمه.
- ⚠️ **تعارض في الصيغة**: الصيغة لا تحتوي السنة، لذا يتكرر نفس اليوم والشهر كل سنة (12/11/2026 و12/11/2027 يعطيان كلاهما `1211…`). لمنع التكرار، يكمل اليوم نفسه في السنة التالية من آخر تسلسل استُخدم (مثلاً `1211004`) بدلاً من العودة إلى 000. الحد الأقصى 1000 سند لليوم الواحد.

## أين تُحفظ البيانات؟ وكيف نضمن عدم ضياعها؟

- **المكان**: قاعدة بيانات IndexedDB باسم `masdar-delivery-notes` داخل المتصفح الذي يفتح التطبيق، على هذا الجهاز فقط. تبقى بعد إغلاق المتصفح أو إعادة تشغيل الجهاز.
- **لا توجد مزامنة** بين الأجهزة أو المتصفحات أو المستخدمين.
- **الاسترجاع**: تُقرأ السندات من القاعدة عند كل فتح للصفحة.
- **الحماية من الضياع**:
  - يطلب التطبيق من المتصفح حماية التخزين من الحذف التلقائي (تظهر حالته في الإعدادات).
  - **صدّر نسخة احتياطية بانتظام** (الإعدادات ← تصدير نسخة احتياطية). ينتج ملف JSON يحتوي كل السندات والعدّادات والإعدادات. تُظهر الرئيسية تنبيهاً إذا مرّ أكثر من 7 أيام دون نسخة احتياطية.
  - **الاستيراد يدمج ولا يحذف**: السند الموجود يُحدَّث فقط إذا كانت نسخته في الملف أحدث، ويُبلَّغ عن أي رقم متعارض، وتُستعاد العدّادات حتى لا يُعاد استخدام أي رقم.
  - ⚠️ مسح بيانات المتصفح («Clear browsing data» مع بيانات المواقع) يحذف السندات. احتفظ دائماً بنسخة احتياطية حديثة.

## السجل والتعديل

- لكل سند معرّف داخلي ثابت (UUID) ورقم لا يتغير.
- التعديل يحفظ على نفس السجل ويعيد حساب الصافي، دون تغيير الرقم أو التواريخ أو اسم الناقل.
- **سجل التعديلات** (Audit Log) يوضح وقت كل تعديل، والحقل، والقيمة القديمة والجديدة، وكل عملية طباعة أو تنزيل.
- حالة السند: «لم يُطبع» ← «مطبوع» ← «عُدِّل — يحتاج إعادة طباعة».

---

## Developer notes

```
index.html                 app shell (open directly, file:// supported)
css/                       fonts.css, style.css (tokens/layout), components.css, pages.css, splash.css
js/core/                   no-DOM logic, unit-tested in Node
  format.js                weights in integer kg, date formats, serial format
  delivery-notes.js        validation, net calc, diff, status
  storage.js               IndexedDB: atomic numbering, edit + audit, backup/import
  arabic-shaper.js         Arabic -> presentation forms (for the original embedded font)
  pdf-generator.js         fills the official template with pdf-lib at measured coordinates
js/ui/                     i18n (ar/en, RTL/LTR), shared UI helpers, print/download
js/pages/                  dashboard, new-note, history, note-view, settings
js/app.js                  router, splash, unsaved-changes guard
js/vendor/                 pdf-lib 1.17.1, @pdf-lib/fontkit 1.1.1 (bundled, offline)
js/generated/              embedded-assets.js (template + fonts as base64) — built by tools/
tools/build_template.py    official PDF -> clean template + embedded assets (needs: pip install pymupdf)
documents/original-template.pdf   untouched copy of the official form
tests/                     run-tests.js, generate-sample.js + compare_pdf.py, file-protocol-check.js
```

```bash
npm install
npm test              # numbering, persistence, edit/audit, carrier, backup, PDF (18 tests)
npm run test:pdf      # generate a note with the sample values and compare with the original
npm run test:file     # opens the app engine from file:// in headless Edge/Chrome
npm run build:template
```

Fonts: the UI uses IBM Plex Sans Arabic (body) and Noto Kufi Arabic (headings) — both SIL Open Font License — bundled in `assets/fonts/ui`. `assets/fonts/arial.ttf` is copied from Windows for the PDF; Arial is licensed with Windows, so keep this app for internal use on licensed Windows machines.
