/* ADIC2 La Cabana — menu v2 (vanilla JS). Data: window.MENU from data/menu.js (built by tools/build.py). */
(() => {
  const M = window.MENU;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const T = {
    ar: {
      skip: 'تخطَّ إلى المنيو', sections: 'الأقسام', search: 'بحث', close: 'إغلاق', searchPh: 'ابحث عن طبق أو مشروب…',
      heroEyebrow: 'مطعم ومقهى · الرياض', heroT1: 'مطبخ لبناني', heroT2: 'بروح عصرية',
      heroLead: 'فطور، مقبلات، مشاوي، باستا، حلويات وقهوة — اختر طبقك من قائمتنا.', heroCta: 'تصفّح المنيو',
      sigEyebrow: 'أطباق أديكتو', sigTitle: 'أطباق تميّزنا', sigLead: 'اختيارات الشيف — ابدأ بها في زيارتك الأولى.', sigCta: 'المنيو كاملاً',
      featTitle: 'لماذا أديكتو؟', f1t: 'مطبخ لبناني', f1d: 'مقبلات وفتات ومشاوي بطابع لبناني أصيل.',
      f2t: 'قهوة وحلويات', f2d: 'قهوة مختصة وحلويات بلمسة أديكتو.', f3t: 'جلسات مريحة', f3d: 'جلسات داخلية وخارجية للعائلة والأصدقاء.',
      noResults: 'لا توجد نتائج — جرّب كلمة أخرى.', footCity: 'الرياض، المملكة العربية السعودية', footNote: 'الأسعار بالريال السعودي.',
      toTop: 'للأعلى', cur: 'ر.س', items: n => `${n} ${n > 10 ? 'صنف' : 'أصناف'}`,
      veg: 'نباتي', hot: 'حار', sig: 'مميّز', cal: n => `${n} سعرة`, title: 'أديكتو لا كابانا — المنيو', other: 'English',
    },
    en: {
      skip: 'Skip to menu', sections: 'Sections', search: 'Search', close: 'Close', searchPh: 'Search a dish or a drink…',
      heroEyebrow: 'Restaurant & Café · Riyadh', heroT1: 'Lebanese kitchen,', heroT2: 'modern soul',
      heroLead: 'Breakfast, mezze, grills, pasta, desserts and coffee — pick your plate from our menu.', heroCta: 'Browse the menu',
      sigEyebrow: 'ADIC2 signatures', sigTitle: 'Dishes we are known for', sigLead: "The chef's picks — start here on your first visit.", sigCta: 'Full menu',
      featTitle: 'Why ADIC2?', f1t: 'Lebanese kitchen', f1d: 'Mezze, fatteh and grills with an authentic Lebanese touch.',
      f2t: 'Coffee & desserts', f2d: 'Specialty coffee and desserts with an ADIC2 twist.', f3t: 'Easy seating', f3d: 'Indoor and outdoor seating for family and friends.',
      noResults: 'No results — try another word.', footCity: 'Riyadh, Saudi Arabia', footNote: 'Prices in Saudi riyals.',
      toTop: 'Back to top', cur: 'SAR', items: n => `${n} item${n === 1 ? '' : 's'}`,
      veg: 'Vegetarian', hot: 'Spicy', sig: 'Signature', cal: n => `${n} kcal`, title: 'ADIC2 La Cabana — Menu', other: 'عربي',
    },
  };

  let lang = (() => {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'en' || q === 'ar') return q;
    try { return localStorage.getItem('lc-lang') || 'ar'; } catch { return 'ar'; }
  })();
  const t = k => T[lang][k];
  const L = (o, ar = 'ar', en = 'en') => (lang === 'ar' ? o[ar] : o[en]) || o[ar] || o[en] || '';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = p => (p == null ? '' : Number.isInteger(p) ? String(p) : p.toFixed(2).replace(/\.?0+$/, ''));
  const price = p => (p == null ? '' : `<span class="price">${fmt(p)}<small>${t('cur')}</small></span>`);

  const ICON_FOOD = '<svg viewBox="0 0 48 48"><path d="M8 30h32a16 16 0 0 1-32 0Z"/><path d="M24 14v4M6 30h36"/><circle cx="24" cy="12" r="2"/></svg>';
  const ICON_CUP = '<svg viewBox="0 0 48 48"><path d="M11 18h22v10a10 10 0 0 1-10 10h-2a10 10 0 0 1-10-10Z"/><path d="M33 20h3a5 5 0 0 1 0 10h-3M17 8c0 3 3 3 3 6M24 8c0 3 3 3 3 6"/></svg>';

  const byId = new Map();
  M.categories.forEach(c => c.items.forEach(it => byId.set(it.id, { ...it, cat: c })));

  function stage(it, kind, eager) {
    const drink = kind === 'drink';
    const inner = it.img
      ? `<img src="assets/dishes/${it.img}-sm.webp" srcset="assets/dishes/${it.img}-sm.webp 380w, assets/dishes/${it.img}.webp 760w"
           sizes="(min-width:1100px) 260px, (min-width:760px) 30vw, 46vw" alt="${esc(L(it))}" ${eager ? '' : 'loading="lazy"'} decoding="async">`
      : `<span class="stage__none">${drink ? ICON_CUP : ICON_FOOD}</span>`;
    return `<span class="stage${drink ? ' stage--drink' : ''}"><span class="stage__ring"></span>${inner}</span>`;
  }
  function tags(it) {
    const out = [];
    if (it.sig) out.push(`<span class="tag tag--sig">${t('sig')}</span>`);
    if (it.veg) out.push(`<span class="tag tag--veg">${t('veg')}</span>`);
    if (it.spicy) out.push(`<span class="tag tag--hot">${t('hot')}</span>`);
    return out.join('');
  }
  function card(it, kind, eager) {
    const alt = lang === 'ar' ? it.en : it.ar;
    return `<button class="card" data-id="${it.id}" type="button">
      ${stage(it, kind, eager)}
      <span class="card__body">
        <span class="card__name">${esc(L(it))}</span>
        ${alt && alt !== L(it) ? `<span class="card__alt">${esc(alt)}</span>` : ''}
        ${L(it, 'dar', 'den') ? `<span class="card__desc">${esc(L(it, 'dar', 'den'))}</span>` : ''}
        <span class="card__foot">${price(it.price)}<span class="plus" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10"/></svg></span></span>
      </span></button>`;
  }
  function row(it) {
    const alt = lang === 'ar' ? it.en : it.ar;
    return `<li class="row"><span class="row__name">${esc(L(it))}${alt ? `<span class="row__alt">${esc(alt)}</span>` : ''}</span><span class="row__dots"></span>${price(it.price)}</li>`;
  }

  function render() {
    const html = document.documentElement;
    html.lang = lang; html.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.title = t('title');
    $$('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
    $$('[data-t-aria]').forEach(el => el.setAttribute('aria-label', t(el.dataset.tAria)));
    $$('[data-t-ph]').forEach(el => el.setAttribute('placeholder', t(el.dataset.tPh)));
    $('#langBtn').textContent = lang === 'ar' ? 'EN' : 'ع';
    $('#langBtn').setAttribute('aria-label', t('other'));

    const sigItems = M.categories.flatMap(c => c.items.filter(i => i.sig && i.img).map(i => ({ i, k: c.kind })));
    $('#sigTrack').innerHTML = sigItems.map(({ i, k }) => card(i, k)).join('');

    $('#chips').innerHTML = M.categories.map((c, n) =>
      `<a class="chip" role="tab" href="#cat-${c.id}" data-cat="${c.id}" aria-selected="${n === 0}">${esc(L(c))}</a>`).join('');
    $('#drawerList').innerHTML = M.categories.map(c =>
      `<li><a href="#cat-${c.id}" data-close>${esc(L(c))}<span>${c.items.length}</span></a></li>`).join('');

    $('#sections').innerHTML = M.categories.map(c => `
      <section class="cat" id="cat-${c.id}" data-cat="${c.id}">
        <header class="cat__head reveal"><div><h2>${esc(L(c))}</h2>${L(c, 'sar', 'sen') ? `<p>${esc(L(c, 'sar', 'sen'))}</p>` : ''}</div>
          <span class="cat__count">${t('items')(c.items.length)}</span></header>
        ${c.kind === 'list'
          ? `<ul class="rows">${c.items.map(row).join('')}</ul>`
          : `<div class="grid">${c.items.map(i => card(i, c.kind)).join('')}</div>`}
      </section>`).join('');
    observe();
    if ($('#searchInput').value) filter($('#searchInput').value);
  }

  /* reveal + scroll-spy */
  let revealIO, spyIO;
  function observe() {
    revealIO?.disconnect(); spyIO?.disconnect();
    revealIO = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
    $$('.reveal:not(.in)').forEach(el => revealIO.observe(el));
    spyIO = new IntersectionObserver(es => {
      es.forEach(e => {
        if (!e.isIntersecting) return;
        const id = e.target.dataset.cat;
        $$('.chip').forEach(ch => {
          const on = ch.dataset.cat === id; ch.setAttribute('aria-selected', on);
          if (on) ch.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    $$('.cat').forEach(s => spyIO.observe(s));
  }

  /* dish sheet */
  let lastFocus;
  function openSheet(id) {
    const it = byId.get(id); if (!it) return;
    lastFocus = document.activeElement;
    $('#sheetStage').innerHTML = stage(it, it.cat.kind, true).replace(/-sm\.webp" srcset="[^"]*"/, '.webp"');
    $('#sheetCat').textContent = L(it.cat);
    $('#sheetName').textContent = L(it);
    const alt = lang === 'ar' ? it.en : it.ar;
    $('#sheetAlt').textContent = alt && alt !== L(it) ? alt : '';
    $('#sheetTags').innerHTML = tags(it) + (it.cal ? `<span class="tag">${t('cal')(it.cal)}</span>` : '');
    $('#sheetDesc').textContent = L(it, 'dar', 'den');
    $('#sheetPrice').innerHTML = it.price == null ? '' : `${fmt(it.price)}<small>${t('cur')}</small>`;
    show($('#sheet'));
  }
  function show(el) { el.hidden = false; document.body.style.overflow = 'hidden'; $('[data-close]', el)?.focus(); }
  function hide(el) { el.hidden = true; document.body.style.overflow = ''; lastFocus?.focus?.(); }

  /* search */
  const norm = s => (s || '').toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  function filter(q) {
    const n = norm(q.trim()); let any = false;
    $$('.cat').forEach(sec => {
      let hit = 0;
      $$('[data-id], .row', sec).forEach(el => {
        const it = el.dataset.id ? byId.get(el.dataset.id) : null;
        // names match anywhere; descriptions only at word start (so "حمص" doesn't hit "خبز محمص")
        const name = it ? norm(`${it.ar} ${it.en}`) : norm(el.textContent);
        const words = it ? norm(`${it.dar || ''} ${it.den || ''}`).split(/[\s،,.()\-–]+/) : [];
        const ok = !n || name.includes(n) || words.some(w => w.startsWith(n) || w.startsWith('ال' + n));
        el.hidden = !ok; if (ok) hit++;
      });
      sec.hidden = !hit; if (hit) any = true;
    });
    $('#noResults').hidden = any;
    $('#signature').hidden = !!n; $('.feat').hidden = !!n; $('#hero').hidden = !!n;
  }

  /* events */
  document.addEventListener('click', e => {
    const c = e.target.closest('.card'); if (c) { openSheet(c.dataset.id); return; }
    const overlay = e.target.closest('.drawer, .sheet');
    if (overlay && (e.target === overlay || e.target.closest('[data-close]'))) hide(overlay);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') ['#sheet', '#drawer'].forEach(s => { if (!$(s).hidden) hide($(s)); });
  });
  $('#openDrawer').addEventListener('click', () => { lastFocus = document.activeElement; show($('#drawer')); });
  $('#openSearch').addEventListener('click', () => {
    const bar = $('#searchBar'); bar.hidden = !bar.hidden;
    if (!bar.hidden) { $('#searchInput').focus(); document.getElementById('menu').scrollIntoView({ behavior: 'smooth' }); }
  });
  $('#closeSearch').addEventListener('click', () => { $('#searchInput').value = ''; filter(''); $('#searchBar').hidden = true; });
  $('#searchInput').addEventListener('input', e => filter(e.target.value));
  $('#langBtn').addEventListener('click', () => {
    lang = lang === 'ar' ? 'en' : 'ar';
    try { localStorage.setItem('lc-lang', lang); } catch {}
    const u = new URL(location.href); u.searchParams.set('lang', lang); history.replaceState(null, '', u);
    render();
  });

  render();
  // sections are rendered by JS, so a #cat-… link has to be honoured after the first render
  if (location.hash.length > 1) {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    const jump = () => document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'instant' });
    requestAnimationFrame(jump); addEventListener('load', jump, { once: true });
  }
})();
