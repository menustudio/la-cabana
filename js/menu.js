/* ADIC2 La Cabana — menu.js
   Data fetch/validation + full screen composition:
   hero → welcome → [category intro → dish screens | grid pages | list
   pages] × categories → order → closing.
   Everything reads from data; language re-render rebuilds it all. */

import {
  $, $$, emit, t, getLang, storage, toast, ICONS, appLabel, placeholderDataURI,
} from "./utils.js";
import * as story from "./story.js";
import { mountFloats } from "./ingredients.js";

let data = null;
// price and image are NOT required — a missing price hides the price line,
// a missing photo shows the branded placeholder
const REQUIRED = ["id", "name", "background"];
const FAV_KEY = "cabana:favorites";

/* a guest can only be sent to an ordering app that has a real link */
const usableLink = (url) => typeof url === "string" && url.startsWith("http") && !url.includes("REPLACE_ME");
export function hasOrderLinks() {
  return Object.values(data?.restaurant?.orderLinks || {}).some(usableLink);
}

/* drinks and shisha are browsed as pages of cards/rows, not one screen per
   item — how many fit is decided by the guest's screen */
/* the SMALL viewport height (100svh) — stable while a phone's toolbar
   slides in and out, so the page shape never flips mid-scroll */
function stableHeight() {
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;inset-block-start:0;block-size:100svh;inline-size:0;visibility:hidden";
  document.body.append(probe);
  const h = probe.getBoundingClientRect().height || window.innerHeight;
  probe.remove();
  return h;
}

export function pageShape(layout, vw = window.innerWidth, vh = stableHeight()) {
  if (layout === "list") {
    const rows = Math.max(5, Math.floor((vh - 190) / 58));
    const cover = vh >= 620 ? 3 : 0;         // the photo band costs ~3 rows
    return { first: Math.max(4, rows - cover), rest: rows, cover: cover > 0 };
  }
  const cols = vw >= 1024 ? 4 : vw >= 640 ? 3 : 2;
  const rows = vw >= 1024 ? 2 : Math.min(4, Math.max(2, Math.floor((vh - 190) / 175)));
  return { cols, rows, first: cols * rows, rest: cols * rows };
}
export function pageShapeKey() {
  return JSON.stringify([pageShape("grid"), pageShape("list")]);
}

function paginate(items, first, rest) {
  const pages = [items.slice(0, first)];
  for (let i = first; i < items.length; i += rest) pages.push(items.slice(i, i + rest));
  return pages.filter((p) => p.length);
}

export function getData() {
  return data;
}

export function getSignatureDish() {
  if (!data) return null;
  return data.dishes.find((d) => d.signature) ?? data.dishes.find((d) => d.chefChoice) ?? null;
}

/* a promo is a time-boxed screen, shown only inside [from, until]. Both
   stamps carry an explicit offset (+03:00) so a guest's device timezone never
   shifts the window — Riyadh midnight is Riyadh midnight on every phone. */
export function promoActive(promo, now = Date.now()) {
  if (!promo?.id) return false;
  const from = promo.from ? Date.parse(promo.from) : -Infinity;
  const until = promo.until ? Date.parse(promo.until) : Infinity;
  if (Number.isNaN(from) || Number.isNaN(until)) return false;
  return now >= from && now <= until;
}

/* data/ is split per file so each concern stays editable on its own:
   brand.json (identity) · social.json (links) · settings.json (order apps)
   categories.json · menu.json (dishes/drinks) · prices.json (id → price) */
async function fetchJSON(path, optional = false) {
  try {
    // no-cache = revalidate: menu/price edits show up on refresh (304 when unchanged)
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    return await res.json();
  } catch (err) {
    if (optional) {
      console.warn(`[cabana] ${path} unavailable`, err);
      return null;
    }
    throw err;
  }
}

export async function loadData() {
  const [brand, social, settings, categories, menuData, prices, promo] = await Promise.all([
    fetchJSON("data/brand.json", true),
    fetchJSON("data/social.json", true),
    fetchJSON("data/settings.json", true),
    fetchJSON("data/categories.json", true),
    fetchJSON("data/menu.json"),
    fetchJSON("data/prices.json", true),
    fetchJSON("data/promo.json", true),
  ]);
  data = menuData;
  data.restaurant = {
    ...(brand || {}),
    ...(social || {}),
    orderLinks: settings?.orderLinks || {},
  };
  data.categories = (categories || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  // an expired (or not-yet-started) promo is simply absent — no screen, no tile
  data.promo = promoActive(promo) ? promo : null;
  /* a price is either a number, or a list of sized options:
     [{ label: {ar,en}, price: 34 }, …] — used for share platters */
  const priceOf = (id) => {
    const p = prices?.[id];
    if (Array.isArray(p)) {
      const options = p.filter((o) => typeof o?.price === "number" && o.price > 0);
      return options.length ? { options } : null;
    }
    return typeof p === "number" && p > 0 ? { value: p } : null;
  };
  const applyPrice = (d) => {
    const p = priceOf(d.id);
    d.price = p?.value ?? null;
    d.priceOptions = p?.options ?? null;
  };
  data.dishes = (data.dishes || []).filter((d) => {
    const ok = REQUIRED.every((k) => d[k] !== undefined && d[k] !== "");
    if (!ok) console.warn("[cabana] item skipped (missing keys):", d.id || d);
    return ok && d.available !== false;
  });
  data.dishes.forEach(applyPrice);
  data.drinks = (data.drinks || []).filter((d) => d.available !== false);
  data.drinks.forEach(applyPrice);
  return data;
}

export function renderError() {
  const main = $("#snap");
  main.innerHTML = `
    <section class="screen" data-mood="paper">
      <div class="error-card">
        <h2>${t("errorTitle")}</h2>
        <p>${t("errorBody")}</p>
      </div>
    </section>`;
}

/* ---------- render: hero → welcome → categories → drinks → order → closing ---------- */
export function render() {
  const main = $("#snap");
  // clear everything after the hero (re-render on language switch)
  $$(".screen", main).forEach((s, i) => { if (i > 0) s.remove(); });

  const st = story.getStory();
  const append = (node, rail) => {
    if (!node) return;
    if (rail) node.dataset.rail = rail;
    main.append(node);
  };

  // lets CSS make room on the hero while an offer is live (and only then)
  document.body.toggleAttribute("data-promo", Boolean(data.promo));
  renderHeroCategories();

  const catLabel = (id) => {
    const cat = data.categories?.find((c) => c.id === id);
    return cat ? t(cat.label) : id;
  };
  const tpl = $("#dish-template");
  const favs = new Set(storage.get(FAV_KEY, []));
  const orderable = hasOrderLinks();

  // a live promo is the first thing after the cover — one swipe from the QR
  if (data.promo) {
    const node = story.buildPromo(data.promo);
    if (node) {
      append(node, "promo");
      const btn = $(".promo__order", node);
      btn?.addEventListener("click", () => openSheet({ name: data.promo.label }, btn));
    }
  }

  if (st) append(story.buildWelcome(), "welcome");

  const seen = new Set();
  (data.categories || []).forEach((cat) => {
    const dishes = data.dishes.filter((d) => d.category === cat.id);
    if (!dishes.length && !cat.alwaysShow) return;
    const rail = `cat-${cat.id}`;
    append(story.buildCategoryIntro(cat), rail);
    dishes.forEach((d) => seen.add(d.id));
    const layout = cat.layout || "screens";
    if (layout === "grid" || layout === "list") {
      const shape = pageShape(layout);
      const pages = paginate(dishes, shape.first, shape.rest);
      pages.forEach((items, i) => {
        const info = { cat, index: i, total: pages.length, shape };
        append(layout === "grid" ? buildGridPage(items, info) : buildListPage(items, info), rail);
      });
      return;
    }
    dishes.forEach((dish) => append(buildDish(dish, tpl, catLabel, favs, orderable), rail));
  });
  // items whose category id matches no entry in categories.json still render
  const orphans = data.dishes.filter((d) => !seen.has(d.id));
  if (orphans.length) {
    console.warn("[cabana] items without a known category:", orphans.map((d) => d.id));
    orphans.forEach((dish) => append(buildDish(dish, tpl, catLabel, favs, orderable), "end"));
  }

  if (data.drinks.length) append(renderDrinks(), "drinks");

  if (st) {
    // a dine-in menu with no delivery apps yet skips the order screen entirely
    if (orderable) append(story.buildOrder(data.restaurant || {}), "end");
    append(story.buildClosing(data.restaurant || {}), "end");
  }

  emit("menu:rendered", { dishes: data.dishes });
}

/* ---------- hero: section tiles (rebuilt every render → bilingual) ---------- */
function renderHeroCategories() {
  const wrap = $(".hero__cats");
  if (!wrap) return;
  wrap.innerHTML = "";
  const hasDishes = (catId) => data.dishes.some((d) => d.category === catId);

  // the live offer leads the grid, full width, in the poster-red voice
  if (data.promo) {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "hero__cat hero__cat--promo";
    tile.dataset.goto = "promo";
    tile.textContent = t(data.promo.label);
    wrap.append(tile);
  }

  // two groups — what to eat, what to drink — each a wrap of pills
  const groups = [
    { label: { ar: "المأكولات", en: "Food" }, match: (c) => !c.layout || c.layout === "screens" },
    { label: { ar: "المشروبات والشيشة", en: "Drinks & Shisha" }, match: (c) => c.layout === "grid" || c.layout === "list" },
  ];
  groups.forEach((g) => {
    const cats = (data.categories || []).filter((c) => g.match(c) && (hasDishes(c.id) || c.alwaysShow));
    if (!cats.length) return;
    const head = document.createElement("p");
    head.className = "hero__group";
    head.textContent = t(g.label);
    wrap.append(head);
    cats.forEach((cat) => {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "hero__cat";
      tile.dataset.goto = `cat-${cat.id}`;
      tile.textContent = t(cat.label);
      wrap.append(tile);
    });
  });
  if (data.drinks.length) {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "hero__cat";
    tile.dataset.goto = "drinks";
    tile.textContent = t("drinksTitle");
    wrap.append(tile);
  }
  renderCatBar();
}

/* ---------- sticky section switcher (same sections, always reachable) ---------- */
function renderCatBar() {
  const bar = $("#catbar");
  if (!bar) return;
  bar.innerHTML = "";
  const chip = (label, target, extra = "") => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `catbar__chip${extra}`;
    b.dataset.goto = target;
    b.dataset.rail = target;          // matches the section's data-rail group
    b.setAttribute("aria-current", "false");
    b.textContent = label;
    bar.append(b);
  };

  if (data.promo) chip(t(data.promo.label), "promo", " catbar__chip--promo");
  (data.categories || []).forEach((cat) => {
    const has = data.dishes.some((d) => d.category === cat.id);
    if (!has && !cat.alwaysShow) return;
    chip(t(cat.label), `cat-${cat.id}`, cat.alwaysShow ? " catbar__chip--daily" : "");
  });
  if (data.drinks.length) chip(t("drinksTitle"), "drinks");
  renderSectionsSheet();
}

/* ---------- phone: the same sections inside a thumb-reach sheet ---------- */
function renderSectionsSheet() {
  const list = $("#sections-list");
  if (!list) return;
  list.innerHTML = "";
  const row = (label, target, extra = "") => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `sections-sheet__item${extra}`;
    b.dataset.goto = target;
    b.dataset.rail = target;
    b.textContent = label;
    list.append(b);
  };
  if (data.promo) row(t(data.promo.label), "promo", " sections-sheet__item--promo");
  (data.categories || []).forEach((cat) => {
    const has = data.dishes.some((d) => d.category === cat.id);
    if (!has && !cat.alwaysShow) return;
    row(t(cat.label), `cat-${cat.id}`, cat.alwaysShow ? " sections-sheet__item--daily" : "");
  });
  if (data.drinks.length) row(t("drinksTitle"), "drinks");
}

/* the sheet is wired once; data-goto clicks are handled globally by swipe.js */
export function initSectionsSheet() {
  const fab = $("#sections-fab");
  const sheet = $("#sections-sheet");
  if (!fab || !sheet) return;
  const close = () => {
    if (!sheet.open) return;
    const done = () => sheet.close();
    if (window.gsap) gsap.to(sheet, { y: "100%", duration: 0.24, ease: "power2.in", onComplete: done });
    else done();
  };
  fab.addEventListener("click", () => {
    sheet.showModal();
    if (window.gsap) gsap.fromTo(sheet, { y: "100%" }, { y: 0, duration: 0.34, ease: "power3.out" });
  });
  // any section pick closes the sheet; swipe.js performs the jump
  sheet.addEventListener("click", (e) => {
    if (e.target.closest("[data-goto]")) close();
  });
  $(".sheet__close", sheet).addEventListener("click", close);
  sheet.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
}

/* ---------- dish v2 ---------- */
function buildDish(dish, tpl, catLabel, favs, orderable) {
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.id = dish.id;
  node.dataset.mood = dish.background;
  node.dataset.presentation = dish.presentation || "plate";
  node.setAttribute("aria-label", t(dish.name));

  // per-dish adaptive mobile composition (data-driven; desktop CSS ignores it)
  const m = dish.mobile || {};
  // image position is fixed: on mobile the food image ALWAYS precedes the
  // text (menu.json "imagePosition" is intentionally ignored — consistency
  // beats per-dish variation on small screens)
  node.dataset.mImg = "top";
  node.dataset.mAlign = m.textAlign === "center" ? "center" : "start";
  node.dataset.mSize = m.imageScale === "large" ? "large" : "regular";

  // L2 ghost texture word = Latin accent word (subtitle.en keeps it readable at
  // 20vw). Longest word, not first — skips "The"/"A" articles automatically.
  $(".dish__texture", node).textContent = dish.texture ||
    (dish.subtitle?.en || "CABANA").split(" ").reduce((a, b) => (b.length > a.length ? b : a));

  // L3 floating ingredients
  mountFloats(node, dish);

  const img = $(".dish__img", node);
  img.alt = t(dish.name);
  if (dish.image) img.dataset.image = dish.image;
  else {
    img.src = placeholderDataURI();
    img.loading = "eager";
    node.dataset.noPhoto = "";
  }
  if (m.objectPosition) img.style.setProperty("--obj-pos", m.objectPosition);

  $(".dish__kicker", node).textContent = catLabel(dish.category);
  $(".dish__name .reveal__inner", node).textContent = t(dish.name);

  // subtitle is bilingual; show the OPPOSITE language as an editorial accent line
  const sub = $(".dish__subtitle", node);
  const accent = getLang() === "ar" ? dish.subtitle?.en : dish.subtitle?.ar;
  if (accent) {
    const span = $("span", sub);
    span.textContent = accent;
    if (getLang() === "ar") {
      span.lang = "en";
      span.dir = "ltr";
    } else {
      span.lang = "ar";
      span.dir = "rtl";
    }
  } else sub.remove();

  const insp = $(".dish__inspiration", node);
  if (dish.inspiration) insp.textContent = t(dish.inspiration);
  else insp.remove();

  const desc = $(".dish__desc", node);
  if (dish.description && t(dish.description)) desc.textContent = t(dish.description);
  else desc.remove();

  const ul = $(".dish__ingredients", node);
  const ingredients = dish.ingredients ? t(dish.ingredients) || [] : [];
  ingredients.forEach((ing) => {
    const li = document.createElement("li");
    li.textContent = ing;
    ul.append(li);
  });
  if (!ingredients.length) ul.remove();

  // one price, a set of sized options, or none at all (price stays hidden)
  const priceEl = $(".dish__price", node);
  if (dish.priceOptions) {
    const list = document.createElement("ul");
    list.className = "dish__sizes";
    list.setAttribute("role", "list");
    dish.priceOptions.forEach((opt) => {
      const li = document.createElement("li");
      li.innerHTML =
        `<span class="dish__size-label">${t(opt.label)}</span>` +
        `<span class="dish__size-price">${opt.price} <span class="dish__price-cur">${t("sar")}</span></span>`;
      list.append(li);
    });
    priceEl.replaceWith(list);
  } else if (dish.price != null) {
    $(".dish__price-num", node).textContent = dish.price;
    $(".dish__price-cur", node).textContent = t("sar");
  } else {
    priceEl.remove();
  }

  const cal = $(".dish__cal", node);
  if (dish.calories) cal.innerHTML = `${ICONS.flame}<span>${dish.calories} ${t("kcal")}</span>`;
  else cal.remove();

  const time = $(".dish__time", node);
  if (dish.prepTime) time.innerHTML = `${ICONS.clock}<span>${dish.prepTime} ${t("min")}</span>`;
  else time.remove();

  const badges = $(".dish__badges", node);
  const badge = (icon, label) => {
    const b = document.createElement("span");
    b.className = "badge";
    b.innerHTML = `${icon}<span>${label}</span>`;
    badges.append(b);
  };
  if (dish.signature || dish.chefChoice) badge(ICONS.crown, t("chefChoice"));
  if (dish.vegetarian) badge(ICONS.leaf, t("vegetarian"));
  if (dish.spicy) badge(ICONS.chili, t("spicy"));

  const orderBtn = $(".dish__order", node);
  if (orderable) {
    orderBtn.textContent = t("order");
    orderBtn.addEventListener("click", () => openSheet(dish, orderBtn));
  } else {
    orderBtn.remove();              // dine-in: the waiter takes the order
  }

  const favBtn = $(".dish__fav", node);
  favBtn.innerHTML = ICONS.heart;
  const isFav = favs.has(dish.id);
  favBtn.setAttribute("aria-pressed", String(isFav));
  favBtn.setAttribute("aria-label", t(isFav ? "unfavorite" : "favorite"));
  favBtn.addEventListener("click", () => toggleFavorite(dish.id, favBtn));

  const shareBtn = $(".dish__share", node);
  shareBtn.innerHTML = ICONS.share;
  shareBtn.setAttribute("aria-label", t("share"));
  shareBtn.addEventListener("click", () => {
    if (window.gsap) {
      const icon = shareBtn.querySelector("svg");
      gsap.fromTo(icon, { y: 0 }, { y: -3, duration: 0.16, ease: "power2.out", yoyo: true, repeat: 1 });
    }
    share(dish);
  });

  return node;
}

/* ---------- grid pages — drinks as cards, several per screen ---------- */
const altName = (item) => {
  const ar = getLang() === "ar";
  const text = ar ? item.name?.en : item.name?.ar;
  return text ? `<span class="item-alt" lang="${ar ? "en" : "ar"}" dir="${ar ? "ltr" : "rtl"}">${text}</span>` : "";
};
const priceHTML = (item, cls) =>
  item.price != null ? `<span class="${cls}">${item.price} <span class="item-cur">${t("sar")}</span></span>` : "";

function pageSection(cat, index, total, kind) {
  const s = document.createElement("section");
  s.className = `screen ${kind}`;
  s.id = `${cat.id}-${index + 1}`;
  s.dataset.mood = cat.dishMood || "navy";
  s.dataset.animate = "";
  s.setAttribute("aria-label", total > 1 ? `${t(cat.label)} ${index + 1}/${total}` : t(cat.label));
  const count = total > 1
    ? `<span class="page-head__count" data-enter="fade" data-enter-at="0.1">${t("pageOf", { i: index + 1, n: total })}</span>` : "";
  s.innerHTML = `
    <header class="page-head">
      <p class="dish__kicker page-head__title" data-enter="rise" data-enter-at="0">${t(cat.label)}</p>
      ${count}
    </header>`;
  return s;
}

function buildGridPage(items, { cat, index, total, shape }) {
  const s = pageSection(cat, index, total, "grid-page");
  const grid = document.createElement("ul");
  grid.className = "item-grid";
  grid.setAttribute("role", "list");
  grid.style.setProperty("--cols", shape.cols);
  grid.style.setProperty("--rows", shape.rows);
  items.forEach((item, i) => {
    const li = document.createElement("li");
    li.className = "item-card";
    li.id = item.id;
    li.dataset.enter = "pop";
    li.dataset.enterAt = (0.12 + i * 0.045).toFixed(2);
    li.innerHTML = `
      <div class="item-card__media${item.image ? "" : " item-card__media--empty"}">
        ${item.image ? `<img alt="${t(item.name)}" loading="lazy" decoding="async">` : ICONS.crown}
      </div>
      <p class="item-card__name">${t(item.name)}</p>
      ${altName(item)}
      ${priceHTML(item, "item-card__price")}`;
    const img = $("img", li);
    if (img) {
      img.dataset.image = item.image;
      img.dataset.dir = "assets/images/items/";
      img.dataset.sizes = `(min-width:1024px) 18vw, ${Math.round(92 / shape.cols)}vw`;
    }
    grid.append(li);
  });
  s.append(grid);
  return s;
}

/* ---------- list pages — rows with a dotted leader (shisha) ---------- */
function buildListPage(items, { cat, index, total, shape }) {
  const s = pageSection(cat, index, total, "list-page");
  if (index === 0 && shape.cover && cat.coverImage) {
    const fig = document.createElement("figure");
    fig.className = "list-page__cover";
    fig.dataset.enter = "photo";
    fig.dataset.enterAt = "0.05";
    fig.innerHTML = `<img alt="" loading="lazy" decoding="async">`;
    const img = $("img", fig);
    img.dataset.image = cat.coverImage;
    img.dataset.dir = "assets/images/items/";
    img.dataset.sizes = "(min-width:1024px) 40vw, 90vw";
    s.append(fig);
  }
  const ul = document.createElement("ul");
  ul.className = "item-list";
  ul.setAttribute("role", "list");
  items.forEach((item, i) => {
    const li = document.createElement("li");
    li.className = "item-row";
    li.id = item.id;
    li.dataset.enter = "rise";
    li.dataset.enterAt = (0.14 + i * 0.035).toFixed(2);
    li.innerHTML = `
      <span class="item-row__text"><span class="item-row__name">${t(item.name)}</span>${altName(item)}</span>
      <span class="item-row__leader" aria-hidden="true"></span>
      ${priceHTML(item, "item-row__price")}`;
    ul.append(li);
  });
  s.append(ul);
  return s;
}

/* ---------- drinks screen ---------- */
function renderDrinks() {
  const s = document.createElement("section");
  s.className = "screen drinks";
  s.id = "drinks";
  s.dataset.mood = "paper";
  s.dataset.animate = "";
  s.setAttribute("aria-label", t("drinksTitle"));
  s.innerHTML = `
    <div class="drinks__head">
      <p class="dish__kicker drinks__kicker" data-enter="rise" data-enter-at="0">${t("drinksKicker")}</p>
      <h2 class="drinks__title"><span class="reveal"><span class="reveal__inner" data-enter="mask" data-enter-at="0.08">${t("drinksTitle")}</span></span></h2>
    </div>
    <div class="drinks__strip" role="list" tabindex="0" aria-label="${t("drinksTitle")}"></div>`;
  const strip = $(".drinks__strip", s);
  data.drinks.forEach((drink, i) => {
    const card = document.createElement("div");
    card.className = "drink-card";
    card.setAttribute("role", "listitem");
    if (i < 6) {
      card.dataset.enter = "pop";
      card.dataset.enterAt = (0.25 + i * 0.05).toFixed(2);
    }
    card.innerHTML = `
      <img alt="${t(drink.name)}" loading="lazy" decoding="async">
      <p class="drink-card__name">${t(drink.name)}</p>
      ${drink.price != null ? `<p class="drink-card__price">${drink.price} ${t("sar")}</p>` : ""}`;
    const img = $("img", card);
    img.dataset.image = drink.image;
    img.dataset.dir = "assets/images/drinks/";
    img.dataset.sizes = "80px";
    strip.append(card);
  });
  return s;
}

/* ---------- favorites ---------- */
function toggleFavorite(id, btn) {
  const favs = new Set(storage.get(FAV_KEY, []));
  const nowFav = !favs.has(id);
  if (nowFav) favs.add(id);
  else favs.delete(id);
  storage.set(FAV_KEY, [...favs]);
  btn.setAttribute("aria-pressed", String(nowFav));
  btn.setAttribute("aria-label", t(nowFav ? "unfavorite" : "favorite"));
  if (!window.gsap) return;
  gsap.killTweensOf(btn);
  if (nowFav) {
    // double heartbeat
    gsap.timeline()
      .to(btn, { scale: 1.28, duration: 0.14, ease: "power2.out" })
      .to(btn, { scale: 0.94, duration: 0.12, ease: "power2.inOut" })
      .to(btn, { scale: 1.1, duration: 0.12, ease: "power2.inOut" })
      .to(btn, { scale: 1, duration: 0.18, ease: "power2.out" });
  } else {
    gsap.fromTo(btn, { scale: 0.9 }, { scale: 1, duration: 0.25, ease: "power2.out" });
  }
}

/* ---------- share ---------- */
async function share(dish) {
  const url = `${location.origin}${location.pathname}#${dish.id}`;
  const brand = t(data?.restaurant?.name || { ar: "أديكتو لا كابانا", en: "ADIC2 La Cabana" });
  const payload = { title: `${brand} — ${t(dish.name)}`, text: dish.description ? t(dish.description) : "", url };
  try {
    if (navigator.share) {
      await navigator.share(payload);
      return;
    }
    await navigator.clipboard.writeText(url);
    toast(t("linkCopied"));
  } catch (err) {
    if (err?.name === "AbortError") return;
    try {
      await navigator.clipboard.writeText(url);
      toast(t("linkCopied"));
    } catch {
      toast(url);
    }
  }
}

/* ---------- order bottom sheet ---------- */
let lastTrigger = null;

export function openSheet(dish, trigger) {
  const sheet = $("#order-sheet");
  lastTrigger = trigger;
  $("#sheet-title").textContent = t(dish.name);

  const linksEl = $("#sheet-links");
  const merged = { ...(data.restaurant?.orderLinks || {}) };
  for (const [app, url] of Object.entries(dish.orderLinks || {})) {
    if (url) merged[app] = url;
  }
  const entries = Object.entries(merged).filter(([, url]) => url && !url.includes("REPLACE_ME"));
  linksEl.innerHTML = entries.length
    ? entries.map(([app, url]) =>
        `<a href="${url}" target="_blank" rel="noopener">${appLabel(app)}</a>`).join("")
    : `<p class="sheet__sub">${getLang() === "ar" ? "روابط الطلب تُضاف قريباً" : "Ordering links coming soon"}</p>`;

  sheet.showModal();
  if (window.gsap) {
    gsap.fromTo(sheet, { y: "100%" }, { y: 0, duration: 0.38, ease: "power3.out" });
  } else {
    sheet.style.transform = "translateY(0)";
  }
}

export function initSheet() {
  const sheet = $("#order-sheet");
  const close = () => {
    if (!sheet.open) return;
    const done = () => {
      sheet.close();
      lastTrigger?.focus({ preventScroll: true });
    };
    if (window.gsap) {
      gsap.to(sheet, { y: "100%", duration: 0.26, ease: "power2.in", onComplete: done });
    } else done();
  };
  $(".sheet__close", sheet).addEventListener("click", close);
  sheet.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
  // close only on real backdrop clicks — clicks on the dialog's own padding
  // and grid gaps also have e.target === sheet, so test the coordinates
  sheet.addEventListener("click", (e) => {
    if (e.target !== sheet) return;
    const r = sheet.getBoundingClientRect();
    const inside =
      e.clientX >= r.left && e.clientX <= r.right &&
      e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) close();
  });
}
