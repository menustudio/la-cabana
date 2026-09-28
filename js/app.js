/* ADIC2 La Cabana — app.js
   Boot orchestration only. Feature logic lives in the modules. */

import {
  $, on, initI18n, getLang, setLang, t, applyStaticI18n, applyImage,
} from "./utils.js";
import * as menu from "./menu.js";
import * as story from "./story.js";
import * as swipe from "./swipe.js";
import * as animations from "./animations.js";
import * as parallax from "./parallax.js";
import * as loader from "./loader.js";

async function boot() {
  // 1) kick every fetch off in parallel — nothing gates the hero image
  const stringsPromise = fetch("data/i18n.json", { cache: "no-cache" }).then((r) => r.json());
  const dataPromise = menu.loadData();
  const storyPromise = story.loadStory(); // tolerant — never throws
  const loaderDone = loader.run(dataPromise, storyPromise);

  let strings = { en: {}, ar: {} };
  try {
    strings = await stringsPromise;
  } catch (err) {
    console.warn("[cabana] i18n load failed", err);
  }
  initI18n(strings);
  applyStaticI18n();
  updateLangButton();
  // wire the toggle before the data gate so it works on the error screen too
  $("#lang-toggle").addEventListener("click", onLangToggle);

  try {
    await dataPromise;
  } catch (err) {
    console.error("[cabana] menu load failed", err);
    menu.renderError();
    await loaderDone;
    return;
  }
  await storyPromise;

  menu.render();
  menu.initSheet();
  menu.initSectionsSheet();
  injectMenuSchema();

  // engines (dish DOM exists now)
  swipe.init();
  swipe.initNavAutoHide();
  animations.init();
  animations.bindImages(applyImage);
  // heavy GSAP work (20 timelines + ~80 scrubs) waits for idle — the loader
  // covers this window; unbound sections degrade to fully-visible content
  idle(() => {
    animations.bindDishes();
    parallax.init();
  });

  // drink/shisha pages are sized to the screen — re-paginate when a phone
  // rotates or a desktop window is resized enough to change the page shape
  // (width changes only — a phone's toolbar changing the height must never
  // rebuild the page under the guest's thumb)
  let shape = menu.pageShapeKey();
  let lastWidth = window.innerWidth;
  let resizeTimer;
  window.addEventListener("resize", () => {
    if (window.innerWidth === lastWidth) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      lastWidth = window.innerWidth;
      const next = menu.pageShapeKey();
      if (next === shape) return;
      shape = next;
      rerender();
    }, 300);
  });

  // reveal
  await loaderDone;
  animations.heroEntrance();

  // PWA: register after the reveal so it never competes with boot
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.warn("[cabana] sw registration failed", err);
    });
  }
}

/* SEO: Menu/MenuItem JSON-LD generated from the same data the page renders */
function injectMenuSchema() {
  const data = menu.getData();
  if (!data) return;
  const sections = (data.categories || []).map((cat) => ({
    "@type": "MenuSection",
    name: cat.label?.ar || cat.id,
    hasMenuItem: data.dishes
      .filter((d) => d.category === cat.id)
      .map((d) => {
        const item = { "@type": "MenuItem", name: d.name?.ar || d.id, description: d.description?.ar || "" };
        if (d.priceOptions?.length) {
          item.offers = d.priceOptions.map((o) => ({
            "@type": "Offer",
            name: o.label?.ar || o.label?.en || "",
            price: String(o.price),
            priceCurrency: "SAR",
          }));
        } else if (d.price != null) {
          item.offers = { "@type": "Offer", price: String(d.price), priceCurrency: "SAR" };
        }
        return item;
      }),
  }));
  const schema = {
    "@context": "https://schema.org",
    "@type": "Menu",
    name: `منيو ${data.restaurant?.name?.ar || "أديكتو لا كابانا"}`,
    inLanguage: "ar",
    hasMenuSection: sections,
  };
  const el = document.createElement("script");
  el.type = "application/ld+json";
  el.textContent = JSON.stringify(schema);
  document.head.append(el);
}

const idle = (fn) =>
  ("requestIdleCallback" in window ? requestIdleCallback(fn, { timeout: 400 }) : setTimeout(fn, 120));

function onLangToggle() {
  const next = getLang() === "ar" ? "en" : "ar";
  setLang(next);
  applyStaticI18n();
  updateLangButton();
  if (!menu.getData()) {
    menu.renderError();          // menu never loaded — re-render the error card
    return;
  }
  rerender();
}

/* rebuild every screen in place (language switch, page-shape change) and
   keep the guest on the section they were reading */
function rerender() {
  const keepId = swipe.getScreens()[swipe.getActiveIndex()]?.id;
  menu.render();                 // rebuild dish/drinks/finale DOM
  const screens = [...document.querySelectorAll("#snap .screen")];
  const found = keepId ? screens.findIndex((s) => s.id === keepId) : -1;
  swipe.rebind(found >= 0 ? found : Math.min(swipe.getActiveIndex(), screens.length - 1));
  animations.bindDishes();       // rebuild timelines for new DOM
  animations.bindImages(applyImage);
  parallax.bind();
  // the hero tiles were rebuilt as fresh nodes — the entrance already played,
  // so reveal them directly (the js-motion pre-hide would otherwise stick)
  if (window.gsap) gsap.set(".hero__cats > *, .hero .swipe-hint", { opacity: 1, y: 0, scale: 1 });
}

function updateLangButton() {
  const btn = $("#lang-toggle");
  const ar = getLang() === "ar";
  btn.textContent = ar ? "EN" : "ع";
  btn.setAttribute("aria-label", ar ? "Switch to English" : "التبديل إلى العربية");
}

/* GSAP CDN scripts are deferred like this module — wait for full parse */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
