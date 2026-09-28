# -*- coding: utf-8 -*-
"""
ADIC2 La Cabana — qlub sync.

The restaurant maintains its menu in qlub. This pulls the live menu from
qlub's public menu API and regenerates the site's data from it, so a price
change in qlub reaches the site with one command:

    python tools/qlub-sync.py            # fetch live, write data + download new photos
    python tools/qlub-sync.py --offline  # rebuild from the last cached fetch

What comes from qlub (always): prices, calories, photos, availability, and
which items exist. What comes from tools/qlub-overrides.json: clean Arabic /
English names and descriptions (qlub's own English is machine-translated).
An item qlub adds later with no override still appears, using qlub's text —
the run lists such items so the copy can be cleaned up.

Writes
  data/menu.json      dishes (every item; category layout decides the screen)
  data/prices.json    slug -> price
  tools/sources.json  slug -> local photo path (feeds optimize-images.py)
  _sources/qlub/      original photos, one per qlub product (not deployed)
"""
import json
import sys
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
TOOLS = ROOT / "tools"
DATA = ROOT / "data"
CACHE = TOOLS / "_qlub_cache"
PHOTOS = ROOT / "_sources" / "qlub"

API = ("https://api.qlub.cloud/v1/menu/sa/adic2_ryd_diyafah/"
       "0296F2F4-66AF-458F-AD18-FD012E0C2D71/_/_/ecba1b1ac2")
MENU_ID = "awk7P"
HEADERS = {"Origin": "https://app.qlub.io", "User-Agent": "Mozilla/5.0"}


def fetch_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as res:
        return json.load(res)


def fetch_all(offline):
    CACHE.mkdir(parents=True, exist_ok=True)
    menu_path = CACHE / "menu.json"
    if offline:
        menu = json.loads(menu_path.read_text(encoding="utf-8"))
    else:
        menu = fetch_json(f"{API}/menu?limit=100&page=0")
        menu_path.write_text(json.dumps(menu, ensure_ascii=False), encoding="utf-8")
    main = next(m for m in menu["data"] if m["id"] == MENU_ID)
    cats = []
    for cat in main["categories"]:
        path = CACHE / f"cat_{cat['id']}.json"
        if offline:
            payload = json.loads(path.read_text(encoding="utf-8"))
        else:
            payload = fetch_json(f"{API}/{MENU_ID}/category/{cat['id']}?limit=100&page=0")
            if payload["data"].get("hasMorePage"):
                sys.exit(f"category {cat['id']} has more than 100 items — add paging")
            path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        cats.append((cat, payload["data"]["products"]))
    return cats


def photo_url(product):
    media = product.get("coverMedia") or {}
    return media.get("originalFile") or (media.get("thumbnail") or {}).get("url")


def download(pid, url):
    """Original photo cached by qlub id; re-downloaded only when the URL changes."""
    PHOTOS.mkdir(parents=True, exist_ok=True)
    last = url.rsplit("/", 1)[-1]
    ext = last.rsplit(".", 1)[-1].lower() if "." in last else "img"
    out = PHOTOS / f"{pid}.{ext}"
    stamp = PHOTOS / f"{pid}.url"
    if out.exists() and stamp.exists() and stamp.read_text() == url:
        return out
    for candidate in (url, url.replace("https://qlub-cloud.s3.ap-southeast-1.amazonaws.com",
                                       "https://cdn-customerapp.qlub.io")):
        try:
            req = urllib.request.Request(candidate, headers={"User-Agent": "Mozilla/5.0"})
            out.write_bytes(urllib.request.urlopen(req, timeout=90).read())
            stamp.write_text(url)
            return out
        except Exception as err:  # noqa: BLE001 — try the CDN mirror next
            last_err = err
    print(f"  !! photo failed {pid}: {last_err}")
    return None


def main():
    offline = "--offline" in sys.argv
    overrides = json.loads((TOOLS / "qlub-overrides.json").read_text(encoding="utf-8"))
    cat_map = overrides["categories"]
    item_ov = overrides["items"]
    categories = json.loads((DATA / "categories.json").read_text(encoding="utf-8"))
    cat_conf = {c["id"]: c for c in categories}

    dishes, prices, sources = [], {}, {}
    unknown_items, unknown_cats, seen_slugs = [], [], set()
    for cat, products in fetch_all(offline):
        cid = cat_map.get(cat["id"])
        if not cid or cid not in cat_conf:
            unknown_cats.append(f"{cat['id']} {cat.get('name')}")
            continue
        conf = cat_conf[cid]
        for p in sorted(products, key=lambda x: x.get("order", 0)):
            ov = item_ov.get(p["id"])
            nt = p.get("nameTranslations") or {}
            dt = p.get("descriptionTranslations") or {}
            if not ov:
                unknown_items.append(f"{p['id']} {p['name']}")
                ov = {
                    "slug": f"{cid}-{p['id'].lower()}",
                    "name": {"en": (nt.get("en") or p["name"]).strip(), "ar": (nt.get("ar") or "").strip()},
                    "description": {"en": (dt.get("en") or "").strip(), "ar": (dt.get("ar") or "").strip()},
                }
            slug = ov["slug"]
            if slug in seen_slugs:
                sys.exit(f"duplicate slug {slug}")
            seen_slugs.add(slug)

            kcal = None
            for n in ((p.get("meta") or {}).get("nutrition") or []):
                if n.get("key") == "maxCalories" and str(n.get("value", "")).isdigit():
                    kcal = int(n["value"])

            url = photo_url(p)
            has_photo = False
            if url and not offline:
                path = download(p["id"], url)
                if path:
                    sources[slug] = str(path)
                    has_photo = True
            elif url:
                cached = next(PHOTOS.glob(f"{p['id']}.*[!l]"), None)  # skip the .url stamp
                if cached:
                    sources[slug] = str(cached)
                    has_photo = True

            desc = ov.get("description") or {}
            dish = {
                "id": slug,
                "qlubId": p["id"],
                "category": cid,
                "name": ov["name"],
                # the opposite-language name doubles as the editorial accent line
                "subtitle": {"en": ov["name"]["en"], "ar": ov["name"]["ar"]},
                "description": desc if (desc.get("ar") or desc.get("en")) else None,
                "calories": kcal,
                "image": slug if has_photo else None,
                "background": conf.get("dishMood", "navy"),
                "available": p.get("status") == "ENABLED" and not p.get("snoozed"),
            }
            for flag in ("vegetarian", "spicy", "signature"):
                if ov.get(flag):
                    dish[flag] = True
            dishes.append({k: v for k, v in dish.items() if v is not None})
            if isinstance(p.get("price"), (int, float)) and p["price"] > 0:
                prices[slug] = p["price"]

    order = {c["id"]: c.get("order", 0) for c in categories}
    dishes.sort(key=lambda d: order.get(d["category"], 99))  # stable: keeps qlub order inside a category

    (DATA / "menu.json").write_text(json.dumps(
        {"version": 1, "source": "qlub", "dishes": dishes, "drinks": []},
        ensure_ascii=False, indent=1), encoding="utf-8")
    (DATA / "prices.json").write_text(json.dumps(
        {"_README": "Synced from qlub by tools/qlub-sync.py — change prices in qlub, then re-run the sync.", **prices},
        ensure_ascii=False, indent=1), encoding="utf-8")
    (TOOLS / "sources.json").write_text(json.dumps(sources, ensure_ascii=False, indent=1), encoding="utf-8")

    live = sum(1 for d in dishes if d["available"])
    print(f"{len(dishes)} items ({live} available), {len(prices)} prices, {len(sources)} photos")
    if unknown_cats:
        print("!! qlub categories with no mapping (skipped):", *unknown_cats, sep="\n   ")
    if unknown_items:
        print("!! items using qlub's raw text (add them to qlub-overrides.json):", *unknown_items, sep="\n   ")


if __name__ == "__main__":
    main()
