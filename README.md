# أديكتو لا كابانا — المنيو الرقمي

منيو QR لمطعم ومقهى **ADIC2 La Cabana** في الرياض.

صور الأطباق مقصوصة من غير خلفية وواقفة على «أطباق» كحلي. الألوان خمس درجات كحلي (`#03031B` `#080B36` `#0E1946` `#152B5D` `#1D3C6A`) وأكسنت شامبين بلون اللوجو (`#E2C49E`). الموقع عربي وإنجليزي، ومكتوب HTML/CSS/JS خام من غير أي framework.

**الرابط المباشر (للعميل وللـ QR):** https://menustudio.github.io/la-cabana/?lang=ar

## التشغيل المحلي

دبل كليك على `start.bat`، أو شغّل `python -m http.server 4180` داخل المجلد.

## الملفات

| الملف | الوظيفة |
|---|---|
| `index.html` · `css/style.css` · `js/app.js` | الواجهة: الهيرو، أطباق أديكتو، الأقسام، البحث، شيت تفاصيل الطبق، عربي/إنجليزي |
| `data/menu.js` | **مولَّد**: كل الأقسام والأصناف والأسعار اللي الواجهة بتقرأها |
| `data/menu.json` · `categories.json` · `prices.json` · `brand.json` | المصدر اللي `data/menu.js` بيتبني منه |
| `assets/dishes/*.webp` | **مولَّد**: صورة كل صنف من غير خلفية بمقاسين (760 و380) |
| `tools/qlub-sync.py` | بيسحب الأسعار والأصناف من qlub |
| `tools/build.py` | بيبني `data/menu.js` وصور `assets/dishes/` |
| `sw.js` | service worker بيمسح الكاش القديم من موبايلات اللي زاروا النسخة الأولى |

## تحديث الأسعار أو الأصناف

```
python tools/qlub-sync.py     # يسحب الأسعار والأصناف من qlub
python tools/build.py         # يبني data/menu.js وصور الأطباق
```

بعدها زوّد رقم `?v=` في `index.html` واعمل push على `main`. الـ workflow في `.github/workflows/deploy.yml` بينسخ الملفات وينشرها على GitHub Pages.

الصور المقصوصة الأصلية موجودة في `Desktop\شغل كلود\المطاعم - التسويق\لا كابانا\صور المنيو - بدون خلفية\`. علشان كده `build.py` بيشتغل على الجهاز بس، مش جوه الـ workflow.
