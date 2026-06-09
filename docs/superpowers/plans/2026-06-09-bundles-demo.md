# Bundles/Packs Demo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working "bundles/packs" demo on the `alejandrotest` Jumpseller store: a virtual $0 "pack" product that, when added to the cart, adds its real component products (so inventory decrements natively) and groups them visually under the pack on the cart page.

**Architecture:** Theme-native, JS-driven. A `<product-bundle>` custom element on the product page (mirroring the theme's `<product-wishlist>`/`<cart-area>` convention) carries a JSON config of resolved components. A new `theme/assets/bundles.js` intercepts the pack's add-to-cart and uses the existing storefront SDK `Jumpseller.addMultipleProductsToCart(...)` to batch-add the anchor + components, records group membership in `localStorage`, and on the cart page groups the rows, sums the price, locks component quantities, and wires atomic/break removal. Pure logic (parsing, permalink normalization, price math) lives in `theme/assets/bundle-core.js` and is unit-tested with Node's built-in test runner.

**Tech Stack:** Jumpseller Liquid theme, vanilla JS + the global `Jumpseller` storefront SDK (already loaded by the platform; methods confirmed in `theme/assets/theme.js`), Node `node:test` for unit tests, Playwright MCP for end-to-end verification against the live store. Demo data seeded via the Jumpseller API / MCP server (`mcp.jumpseller.com`).

**Key SDK facts (confirmed in `theme/assets/theme.js`):**
- `Jumpseller.addMultipleProductsToCart(products, { callback })` where `products` is an array of `[productId, qty]` tuples (see `addMultipleToCart`, theme.js:282-305). Callback receives `data` with `data.status` and `data.products_count`.
- `Jumpseller.addProductToCart(id, qty, options, { callback })` (theme.js:331-350).
- `Jumpseller.updateCart(cartItemId, newQty, { callback })` — `newQty === 0` removes the line (theme.js:3800-3879). `cartItemId` = the `data-id` attribute of a `.store-product` row.
- `refreshCartDisplay()` — re-renders `<cart-area>` (theme.js:352+). Global, callable from `bundles.js`.
- Cart row markup (`theme/partials/store_product.liquid`): `<div class="store-product" data-id="{{ prod.id }}">` (line id) containing `<a class="store-product__anchor" href="{{ prod.url }}">` (product permalink path), a `.store-product__delete` button, `.store-product__handler--minus/--plus` buttons, and a `.store-product__input` qty field.

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json` (project root) | Declares the `test` script (`node --test tests/`). No runtime deps. |
| `tests/bundle-core.test.js` | Unit tests for the pure functions in `bundle-core.js`. |
| `theme/assets/bundle-core.js` | **Pure, side-effect-free functions** (UMD: `window.BundleCore` in the browser, `module.exports` in Node): `parseBundleComponents`, `normalizePermalink`, `sumPrices`, `formatPrice`. No DOM, no `localStorage`, no SDK. |
| `theme/assets/bundles.js` | **Browser glue** (loaded as a normal script after `theme.js`): the `<product-bundle>` custom element (intercept add → batch-add via SDK → save membership), and cart-page grouping/removal logic. Uses `window.BundleCore` + the `Jumpseller` SDK + `localStorage`. |
| `theme/components/product-bundle.liquid` | Renders `<product-bundle>` + JSON config from the product's `bundle_components_json` custom field, only when present. |
| `theme/components/product-bundle.json` | Component manifest so the theme registers `product-bundle` (mirrors `product-wishlist.json`). |
| `theme/components/product-template.liquid` | MODIFIED: include `product-bundle` on the product page. |
| `theme/templates/layout.liquid` | MODIFIED: load `bundles.js`. |
| `scripts/setup-demo-bundles.mjs` | **Throwaway/low-priority** seeding via the Jumpseller API: validate creds → ensure custom fields `bundle_components` + `bundle_components_json` → ensure 3 simple component products with finite stock → ensure the virtual $0 pack → **compile** `bundle_components` into `bundle_components_json`. Writes `scripts/demo-fixtures.json` (permalinks + ids) for the e2e tests. |
| `docs/wishlist-para-ingenieros.md` | The handoff "list of desires" for engineers (native version). |

**localStorage schema** (key `jb_bundles`):
```json
{
  "<anchorPermalink>": {
    "name": "Pack Invierno",
    "components": [
      { "permalink": "remera-basica", "variantId": null, "priceValue": 9990 }
    ]
  }
}
```

---

## Phase 0 — Test harness & demo data

### Task 1: Node test harness

**Files:**
- Create: `package.json`
- Create: `tests/smoke.test.js`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "jumpseller-bundles-demo",
  "version": "0.1.0",
  "private": true,
  "description": "Bundles/Packs demo for Jumpseller (alejandrotest store)",
  "scripts": {
    "test": "node --test tests/"
  }
}
```

- [ ] **Step 2: Write a smoke test that fails**

`tests/smoke.test.js`:
```js
const test = require("node:test");
const assert = require("node:assert/strict");

test("harness runs", () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 3: Run the test**

Run: `npm test`
Expected: PASS — `tests 1 / pass 1`. Confirms the runner works.

- [ ] **Step 4: Commit**

```bash
git add package.json tests/smoke.test.js
git commit -m "chore: node:test harness"
```

### Task 2: Seed demo data (low-priority / throwaway)

> The setup is only to seed test data; end users never touch it. Keep it simple. It MAY be done interactively via the MCP server instead of the script if that is faster — but the script is preferred so engineers can re-run it.

**Files:**
- Create: `scripts/setup-demo-bundles.mjs`
- Create (generated): `scripts/demo-fixtures.json`

- [ ] **Step 1: Confirm API credentials before anything else**

Use the `jumpseller-api` skill / MCP server. Verify `GET /store/info.json` returns 200 for `alejandrotest`. If it fails ("Failed to Login" was seen historically), STOP and resolve credentials with the user — this is a hard blocker.

- [ ] **Step 2: Write `scripts/setup-demo-bundles.mjs`**

Idempotent (create-or-update). It must:
1. Read `JUMPSELLER_LOGIN` and `JUMPSELLER_AUTH_TOKEN` from env; abort with a clear message if missing.
2. `GET /store/info.json` to validate; abort on non-200.
3. Ensure a product custom field named `bundle_components` (long text) exists.
4. Ensure a product custom field named `bundle_components_json` (long text) exists.
5. Ensure 3 simple component products exist with finite stock (no variants), e.g.:
   - `Remera Básica` permalink `remera-basica`, price 9990, stock 10
   - `Gorro de Lana` permalink `gorro-lana`, price 5990, stock 5
   - `Medias Pack 3` permalink `medias-pack3`, price 3990, stock 8
6. Ensure the virtual pack product exists: `Pack Invierno`, permalink `pack-invierno`, price 0, stock unlimited, with `bundle_components` =
   `remera-basica,gorro-lana,medias-pack3`
7. **Compile** `bundle_components` → `bundle_components_json` on the pack: for each permalink, look up the product via the API to get `id`, current `price`, `name`, and primary image URL, producing e.g.:
   ```json
   [{"id":111,"permalink":"remera-basica","variant_id":null,"price":9990,"name":"Remera Básica","image":"https://.../remera.jpg"},
    {"id":222,"permalink":"gorro-lana","variant_id":null,"price":5990,"name":"Gorro de Lana","image":"https://.../gorro.jpg"},
    {"id":333,"permalink":"medias-pack3","variant_id":null,"price":3990,"name":"Medias Pack 3","image":"https://.../medias.jpg"}]
   ```
   Save that JSON string into the pack's `bundle_components_json` custom field.
8. Write `scripts/demo-fixtures.json` with `{ "packPermalink": "pack-invierno", "packId": <id>, "components": [ {permalink,id,price}, ... ] }` for the e2e tests.

> Use the API resource shapes from the `jumpseller-api` skill for custom fields and products. Exact field-creation endpoints come from that skill; do not guess — read it first.

- [ ] **Step 3: Run the setup**

Run: `node scripts/setup-demo-bundles.mjs`
Expected: logs each ensured resource; exits 0; `scripts/demo-fixtures.json` written. Re-running prints "already exists / updated" without creating duplicates.

- [ ] **Step 4: Manually confirm in the store**

Open the Jumpseller admin → the `Pack Invierno` product → confirm `bundle_components` and `bundle_components_json` are populated, price is 0. Confirm the 3 components have stock.

- [ ] **Step 5: Commit**

```bash
git add scripts/setup-demo-bundles.mjs scripts/demo-fixtures.json
git commit -m "chore: demo data seeding script (throwaway setup)"
```

---

## Phase 1 — Pure logic (`bundle-core.js`, TDD)

### Task 3: `parseBundleComponents`

**Files:**
- Create: `theme/assets/bundle-core.js`
- Test: `tests/bundle-core.test.js`

- [ ] **Step 1: Write the failing test**

`tests/bundle-core.test.js`:
```js
const test = require("node:test");
const assert = require("node:assert/strict");
const BundleCore = require("../theme/assets/bundle-core.js");

test("parseBundleComponents: permalinks and optional variant ids", () => {
  const out = BundleCore.parseBundleComponents(
    "remera-basica?variant_id:1234567, gorro-lana ,medias-pack3?variant_id:7654321"
  );
  assert.deepEqual(out, [
    { permalink: "remera-basica", variantId: "1234567" },
    { permalink: "gorro-lana", variantId: null },
    { permalink: "medias-pack3", variantId: "7654321" },
  ]);
});

test("parseBundleComponents: empty / blank input → []", () => {
  assert.deepEqual(BundleCore.parseBundleComponents(""), []);
  assert.deepEqual(BundleCore.parseBundleComponents(null), []);
  assert.deepEqual(BundleCore.parseBundleComponents("  , ,"), []);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `../theme/assets/bundle-core.js` (or `parseBundleComponents is not a function`).

- [ ] **Step 3: Create `theme/assets/bundle-core.js` with the UMD wrapper + `parseBundleComponents`**

```js
/* bundle-core.js — pure, side-effect-free helpers for the bundles demo.
   Usable in the browser (window.BundleCore) and in Node tests (module.exports). */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.BundleCore = api;
})(this, function () {
  function parseBundleComponents(raw) {
    if (!raw || typeof raw !== "string") return [];
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((segment) => {
        const [permalinkPart, variantPart] = segment.split("?variant_id:");
        return {
          permalink: permalinkPart.trim(),
          variantId: variantPart ? variantPart.trim() : null,
        };
      })
      .filter((c) => c.permalink.length > 0);
  }

  return { parseBundleComponents };
});
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS — the two `parseBundleComponents` tests pass.

- [ ] **Step 5: Commit**

```bash
git add theme/assets/bundle-core.js tests/bundle-core.test.js
git commit -m "feat(core): parseBundleComponents"
```

### Task 4: `normalizePermalink`

**Files:**
- Modify: `theme/assets/bundle-core.js`
- Test: `tests/bundle-core.test.js`

- [ ] **Step 1: Add failing tests**

Append to `tests/bundle-core.test.js`:
```js
test("normalizePermalink: strips host, leading slash, query and hash", () => {
  assert.equal(
    BundleCore.normalizePermalink("https://alejandrotest.jumpseller.com/remera-basica"),
    "remera-basica"
  );
  assert.equal(BundleCore.normalizePermalink("/gorro-lana"), "gorro-lana");
  assert.equal(BundleCore.normalizePermalink("medias-pack3?x=1#frag"), "medias-pack3");
  assert.equal(BundleCore.normalizePermalink("/path/to/pack-invierno/"), "pack-invierno");
});

test("normalizePermalink: empty / null → ''", () => {
  assert.equal(BundleCore.normalizePermalink(""), "");
  assert.equal(BundleCore.normalizePermalink(null), "");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `normalizePermalink is not a function`.

- [ ] **Step 3: Implement `normalizePermalink`**

In `bundle-core.js`, add the function and include it in the returned object:
```js
  function normalizePermalink(input) {
    if (!input || typeof input !== "string") return "";
    let s = input.split("#")[0].split("?")[0]; // drop hash + query
    s = s.replace(/\/+$/, ""); // drop trailing slashes
    const parts = s.split("/").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : "";
  }
```
Update the return to: `return { parseBundleComponents, normalizePermalink };`

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add theme/assets/bundle-core.js tests/bundle-core.test.js
git commit -m "feat(core): normalizePermalink"
```

### Task 5: `sumPrices` + `formatPrice`

**Files:**
- Modify: `theme/assets/bundle-core.js`
- Test: `tests/bundle-core.test.js`

- [ ] **Step 1: Add failing tests**

Append to `tests/bundle-core.test.js`:
```js
test("sumPrices: sums numbers, ignores non-numeric", () => {
  assert.equal(BundleCore.sumPrices([9990, 5990, 3990]), 19970);
  assert.equal(BundleCore.sumPrices([]), 0);
  assert.equal(BundleCore.sumPrices([100, null, "x", 50]), 150);
});

test("formatPrice: CLP-style formatting", () => {
  assert.equal(
    BundleCore.formatPrice(19970, { locale: "es-CL", currency: "CLP" }),
    "$19.970"
  );
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `sumPrices is not a function`.

- [ ] **Step 3: Implement both**

In `bundle-core.js`, add:
```js
  function sumPrices(values) {
    if (!Array.isArray(values)) return 0;
    return values.reduce((acc, v) => (typeof v === "number" && !isNaN(v) ? acc + v : acc), 0);
  }

  function formatPrice(value, opts) {
    const { locale = "es-CL", currency = "CLP" } = opts || {};
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        maximumFractionDigits: currency === "CLP" ? 0 : 2,
      }).format(value);
    } catch (e) {
      return String(value);
    }
  }
```
Update the return: `return { parseBundleComponents, normalizePermalink, sumPrices, formatPrice };`

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS — all core tests green.

> If the `formatPrice` assertion fails because the Node ICU build emits a non-breaking space or `CLP` prefix, adjust the EXPECTED string in the test to match `Intl` output on the target Node version — the function is correct; the literal just needs to match the runtime. Record the exact Node version in the commit message.

- [ ] **Step 5: Commit**

```bash
git add theme/assets/bundle-core.js tests/bundle-core.test.js
git commit -m "feat(core): sumPrices + formatPrice"
```

---

## Phase 2 — Product page: render + add to cart

### Task 6: `product-bundle.liquid` + register the component

**Files:**
- Create: `theme/components/product-bundle.liquid`
- Create: `theme/components/product-bundle.json`
- Modify: `theme/components/product-template.liquid`

- [ ] **Step 1: Create `theme/components/product-bundle.json`**

Mirror the structure of `theme/components/product-wishlist.json` (open it first to copy the exact schema). Minimal manifest:
```json
{
  "name": "Product Bundle",
  "settings": []
}
```
> If `product-wishlist.json` has required keys this lacks, copy them over and adjust names. The goal is only that the theme registers the `product-bundle` component.

- [ ] **Step 2: Create `theme/components/product-bundle.liquid`**

```liquid
{%- assign bundle_json = '' -%}
{%- for field in prod.product_fields -%}
  {%- for cfv in field.custom_field_values -%}
    {%- if field.label == 'bundle_components_json' -%}{%- assign bundle_json = cfv.value -%}{%- endif -%}
  {%- endfor -%}
{%- endfor -%}

{%- if bundle_json != blank -%}
  <product-bundle class="product-bundle" data-pack-url="{{ prod.url }}">
    <script type="application/json" class="product-bundle-json">
      {
        "pack": { "id": {{ prod.id | json }}, "url": {{ prod.url | json }}, "name": {{ prod.name | json }} },
        "components": {{ bundle_json }}
      }
    </script>
    <p class="product-bundle__note">{% t "Este producto es un pack: al agregarlo se añaden sus componentes al carro." %}</p>
  </product-bundle>
{%- endif -%}
```

- [ ] **Step 3: Include it on the product page**

In `theme/components/product-template.liquid`, find where `product-fields` or `product-form` is rendered (search for `render 'product` or the `<product-form>` include). Immediately after the product form block, add:
```liquid
{% render 'product-bundle', prod: prod %}
```
> Match the existing render style in that file (some themes use `{% render %}` of partials, others reference components). If product-template renders *components* by id rather than partials, instead place the `product-bundle` markup inline using the Liquid from Step 2 (the resolution loop + `<product-bundle>`), wrapped in the same section pattern the file already uses. Use whichever matches the surrounding code.

- [ ] **Step 4: Sync the theme and verify render (Playwright MCP)**

Push the theme to `alejandrotest` (Jumpseller CLI; `theme/.jumpseller-store` identifies the store). Then with Playwright MCP:
- Navigate to `https://alejandrotest.jumpseller.com/pack-invierno`.
- Run in the page console: `JSON.parse(document.querySelector('.product-bundle-json').textContent)`.
- Expected: an object with `pack.id` (the pack product id) and a `components` array of 3 objects each having `id`, `permalink`, `price`, `name`.
- Navigate to a NON-pack product and confirm `.product-bundle-json` does NOT exist (the element only renders when `bundle_components_json` is present).

- [ ] **Step 5: Commit**

```bash
git add theme/components/product-bundle.liquid theme/components/product-bundle.json theme/components/product-template.liquid
git commit -m "feat(theme): product-bundle element renders resolved components"
```

### Task 7: Load `bundles.js` and `bundle-core.js` in the layout

**Files:**
- Modify: `theme/templates/layout.liquid`

- [ ] **Step 1: Find how `theme.js` is loaded**

In `theme/templates/layout.liquid`, search for `theme.js` (e.g. `{{ 'theme.js' | asset_url | script_tag }}` or a `<script src>`).

- [ ] **Step 2: Load core + bundles right AFTER `theme.js`**

Add, immediately after the `theme.js` tag (so `window.Jumpseller`, `refreshCartDisplay`, and `window.BundleCore` are available before `bundles.js` runs):
```liquid
{{ 'bundle-core.js' | asset_url | script_tag }}
{{ 'bundles.js' | asset_url | script_tag }}
```
> Use the exact filter/tag pattern already used for `theme.js` in this file. Order matters: `bundle-core.js` before `bundles.js`.

- [ ] **Step 3: Sync + verify load (Playwright MCP)**

Push the theme. Navigate to any page. In console: `typeof window.BundleCore.parseBundleComponents` → `"function"`. No console errors referencing `bundles.js`.

- [ ] **Step 4: Commit**

```bash
git add theme/templates/layout.liquid
git commit -m "feat(theme): load bundle-core.js + bundles.js"
```

### Task 8: `bundles.js` — intercept add-to-cart, batch-add, save membership

**Files:**
- Create: `theme/assets/bundles.js`

- [ ] **Step 1: Create `theme/assets/bundles.js` with the product-page behavior**

```js
/* bundles.js — bundle (pack) behavior for the storefront.
   Depends on: window.BundleCore, the global Jumpseller SDK, refreshCartDisplay(). */
(function () {
  "use strict";

  var STORAGE_KEY = "jb_bundles";

  function readStore() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch (e) {
      return {};
    }
  }
  function writeStore(store) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  function saveMembership(pack, components) {
    var store = readStore();
    var key = BundleCore.normalizePermalink(pack.url);
    store[key] = {
      name: pack.name,
      components: components.map(function (c) {
        return {
          permalink: BundleCore.normalizePermalink(c.permalink),
          variantId: c.variant_id || null,
          priceValue: typeof c.price === "number" ? c.price : 0,
        };
      }),
    };
    writeStore(store);
  }

  // ----- Product page: <product-bundle> intercepts add-to-cart -----
  var ProductBundle = (function () {
    function el() {}
    return el;
  })();

  function initProductBundle() {
    var node = document.querySelector("product-bundle .product-bundle-json");
    if (!node) return;
    var cfg;
    try {
      cfg = JSON.parse(node.textContent);
    } catch (e) {
      return;
    }
    var addBtn = document.querySelector("button#add-to-cart");
    if (!addBtn) return;

    addBtn.addEventListener(
      "click",
      function (e) {
        // Preempt the theme's own add-to-cart handler for this (pack) product.
        e.preventDefault();
        e.stopImmediatePropagation();

        var products = [[cfg.pack.id, 1]].concat(
          cfg.components.map(function (c) {
            return [c.id, 1];
          })
        );

        var cartArea = document.querySelector("cart-area");
        if (cartArea) cartArea.setIsLoading(true);

        Jumpseller.addMultipleProductsToCart(products, {
          callback: function (data) {
            if (cartArea) cartArea.setIsLoading(false);
            if (data && data.status && data.status !== 200) {
              new ToastNotification({
                type: "error",
                title: I18N.error_adding_to_cart,
                message: (data.responseJSON && data.responseJSON.message) || "",
              });
              return;
            }
            saveMembership(cfg.pack, cfg.components);
            window.location.href = (window.ORDER && window.ORDER.url) || "/cart";
          },
        });
      },
      true // capture phase: runs before the theme's bubble-phase jQuery handler
    );
  }

  // ----- bootstrap -----
  function init() {
    initProductBundle();
    // Cart grouping is added in Task 10.
    if (typeof window.initBundleCart === "function") window.initBundleCart();
  }

  // expose helpers reused by cart logic / tests-in-browser
  window.JBBundles = { readStore: readStore, writeStore: writeStore, saveMembership: saveMembership };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
```

- [ ] **Step 2: Sync the theme**

Push the theme to `alejandrotest`.

- [ ] **Step 3: Verify add-to-cart e2e (Playwright MCP)**

- Navigate to `https://alejandrotest.jumpseller.com/pack-invierno`.
- Note the pre-add stock of each component (from `scripts/demo-fixtures.json` or the product pages).
- Click `#add-to-cart`.
- Expected: redirect to the cart; the cart contains 4 lines — the `Pack Invierno` ($0) anchor plus the 3 components.
- In console: `window.JBBundles.readStore()` → an object keyed by `pack-invierno` with 3 components and numeric `priceValue`s.
- Reload the product pages of the components (or check admin) and confirm each component's stock decreased by 1 → proves native inventory decrement.

- [ ] **Step 4: Commit**

```bash
git add theme/assets/bundles.js
git commit -m "feat(theme): pack add-to-cart batches anchor + components via SDK"
```

---

## Phase 3 — Cart page: grouping & removal

### Task 9: Group the pack rows + sum price + lock quantities

**Files:**
- Modify: `theme/assets/bundles.js`
- Create: `theme/assets/bundles-cart.css` (optional styling) and load it in `layout.liquid` if used.

- [ ] **Step 1: Add cart grouping to `bundles.js`**

Add this block inside the IIFE in `bundles.js` (before the `init` function) and define `window.initBundleCart`:

```js
  function rowPermalink(row) {
    var a = row.querySelector(".store-product__anchor");
    return a ? BundleCore.normalizePermalink(a.getAttribute("href")) : "";
  }
  function rowLineId(row) {
    return row.getAttribute("data-id");
  }
  function lockRowQuantity(row) {
    var input = row.querySelector(".store-product__input");
    if (input) {
      input.setAttribute("readonly", "readonly");
      input.setAttribute("disabled", "disabled");
    }
    row.querySelectorAll(".store-product__handler").forEach(function (b) {
      b.setAttribute("disabled", "disabled");
      b.style.pointerEvents = "none";
      b.style.opacity = "0.4";
    });
  }

  function groupCart() {
    var cartArea = document.querySelector("cart-area");
    if (!cartArea) return;
    var store = readStore();
    var rows = Array.prototype.slice.call(cartArea.querySelectorAll(".store-product"));

    // index rows by product permalink
    var byPermalink = {};
    rows.forEach(function (r) {
      var pl = rowPermalink(r);
      (byPermalink[pl] = byPermalink[pl] || []).push(r);
    });

    Object.keys(store).forEach(function (anchorPl) {
      var entry = store[anchorPl];
      var anchorRows = byPermalink[anchorPl];
      if (!anchorRows || !anchorRows.length) {
        // pack no longer in cart → forget it
        delete store[anchorPl];
        return;
      }
      var anchorRow = anchorRows[0];
      if (anchorRow.dataset.jbGrouped === "1") return; // idempotent

      // build a wrapper around the anchor + its component rows
      var wrapper = document.createElement("div");
      wrapper.className = "jb-pack";
      anchorRow.parentNode.insertBefore(wrapper, anchorRow);
      anchorRow.classList.add("jb-pack__anchor");
      wrapper.appendChild(anchorRow);

      var prices = [];
      entry.components.forEach(function (c) {
        var compRows = byPermalink[c.permalink] || [];
        compRows.forEach(function (cr) {
          cr.classList.add("jb-pack__component");
          lockRowQuantity(cr);
          wrapper.appendChild(cr);
          prices.push(c.priceValue);
        });
      });

      // replace the $0 anchor price with the summed component price
      var priceEl = anchorRow.querySelector(".store-product__price");
      if (priceEl) {
        priceEl.textContent = BundleCore.formatPrice(BundleCore.sumPrices(prices), {});
      }
      // hide the anchor's own quantity controls (qty fixed at 1)
      var qtyWrap = anchorRow.querySelector(".store-product__quantity");
      if (qtyWrap) qtyWrap.style.display = "none";

      // add a "Eliminar pack" button on the anchor (wired in Task 10)
      var del = anchorRow.querySelector(".store-product__delete");
      if (del) del.textContent = (window.I18N && I18N.remove_pack) || "Eliminar pack";

      anchorRow.dataset.jbGrouped = "1";
    });

    writeStore(store);
  }

  window.initBundleCart = groupCart;
```

- [ ] **Step 2 (optional): Add styling**

Create `theme/assets/bundles-cart.css`:
```css
.jb-pack { border: 1px solid var(--color-border, #e5e5e5); border-radius: 8px; padding: .5rem; margin-bottom: 1rem; }
.jb-pack__anchor { font-weight: 600; }
.jb-pack__component { margin-left: 1.5rem; opacity: .95; }
.jb-pack__component::before { content: "↳"; margin-right: .35rem; opacity: .6; }
```
Load it in `layout.liquid` after the main stylesheet using the same `| asset_url | stylesheet_tag` pattern the file uses.

- [ ] **Step 3: Sync + verify grouping (Playwright MCP)**

- Ensure the pack is in the cart (re-add if needed). Navigate to `/cart`.
- Expected: the 3 components appear indented under the `Pack Invierno` row inside a `.jb-pack` box; the anchor shows `$19.970` (sum), not `$0`; component qty inputs are disabled; the anchor's qty control is hidden.
- Add a non-pack product to the cart; confirm it renders normally OUTSIDE any `.jb-pack`.

- [ ] **Step 4: Commit**

```bash
git add theme/assets/bundles.js theme/assets/bundles-cart.css theme/templates/layout.liquid
git commit -m "feat(theme): group pack rows in cart, sum price, lock component qty"
```

### Task 10: "Eliminar pack" → atomic removal

**Files:**
- Modify: `theme/assets/bundles.js`

- [ ] **Step 1: Add a sequential remove helper + wire the anchor delete**

Add to `bundles.js`:
```js
  function removeLines(lineIds, done) {
    var remaining = lineIds.slice();
    function next() {
      if (!remaining.length) {
        if (typeof refreshCartDisplay === "function") refreshCartDisplay().then(done || function () {});
        else if (done) done();
        return;
      }
      var id = remaining.shift();
      Jumpseller.updateCart(id, 0, { callback: function () { next(); } });
    }
    next();
  }
```

In `groupCart`, after `anchorRow.dataset.jbGrouped = "1";`, capture the line ids and wire the anchor delete button to remove the whole group:
```js
      var groupLineIds = [rowLineId(anchorRow)];
      entry.components.forEach(function (c) {
        (byPermalink[c.permalink] || []).forEach(function (cr) {
          groupLineIds.push(rowLineId(cr));
        });
      });

      if (del) {
        var freshDel = del.cloneNode(true); // drop the theme's existing click handler
        del.parentNode.replaceChild(freshDel, del);
        freshDel.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopImmediatePropagation();
          var s = readStore();
          delete s[anchorPl];
          writeStore(s);
          removeLines(groupLineIds);
        });
      }
```

- [ ] **Step 2: Sync + verify atomic removal (Playwright MCP)**

- With the pack in the cart, on `/cart` click "Eliminar pack" on the anchor.
- Expected: the anchor AND all 3 component lines disappear; cart is empty (or only non-pack items remain); `window.JBBundles.readStore()` no longer has the `pack-invierno` key.

- [ ] **Step 3: Commit**

```bash
git add theme/assets/bundles.js
git commit -m "feat(theme): Eliminar pack removes anchor + all components atomically"
```

### Task 11: Removing a component → break the pack

**Files:**
- Modify: `theme/assets/bundles.js`

- [ ] **Step 1: Wire each component row's delete to break the pack**

In `groupCart`, where component rows are appended to the wrapper, replace the simple `wrapper.appendChild(cr)` loop body with handler wiring. After `lockRowQuantity(cr); wrapper.appendChild(cr);`, add:
```js
          (function (componentRow) {
            var cdel = componentRow.querySelector(".store-product__delete");
            if (!cdel) return;
            var freshCdel = cdel.cloneNode(true);
            cdel.parentNode.replaceChild(freshCdel, cdel);
            freshCdel.addEventListener("click", function (e) {
              e.preventDefault();
              e.stopImmediatePropagation();
              // break the pack: remove this component + the $0 anchor;
              // leave the OTHER components as normal loose lines.
              var s = readStore();
              delete s[anchorPl];
              writeStore(s);
              removeLines([rowLineId(componentRow), rowLineId(anchorRow)]);
            });
          })(cr);
```
> `removeLines` and `anchorRow` are in scope from Task 10 / the enclosing `Object.keys(store).forEach` iteration. Define the component delete wiring AFTER `anchorRow` and `removeLines` exist. If lint complains about use-before-define for `removeLines`, move the `removeLines` definition above `groupCart`.

- [ ] **Step 2: Sync + verify break-the-pack (Playwright MCP)**

- Re-add the pack. On `/cart`, click the delete (trash) control on ONE component (e.g. `Gorro de Lana`).
- Expected: that component AND the `$0 Pack Invierno` anchor disappear; the OTHER two components remain in the cart as **normal, ungrouped** rows (no `.jb-pack` box, qty inputs editable again after refresh); `readStore()` no longer has `pack-invierno`.

- [ ] **Step 3: Commit**

```bash
git add theme/assets/bundles.js
git commit -m "feat(theme): removing a component breaks the pack (anchor out, rest loose)"
```

---

## Phase 4 — Handoff doc

### Task 12: `docs/wishlist-para-ingenieros.md`

**Files:**
- Create: `docs/wishlist-para-ingenieros.md`

- [ ] **Step 1: Write the document**

Write `docs/wishlist-para-ingenieros.md` covering (in Spanish, this is the user-facing handoff):
- **Qué es esta demo y sus límites** (resumen + link al spec).
- **Deseos para la versión nativa:**
  1. Resolución nativa de componentes (hoy la "compila" el script de setup en `bundle_components_json`; nativamente la plataforma debería resolver permalinks→producto y exponerlo en Liquid). Independiente de dispositivo (hoy la membresía vive en `localStorage`).
  2. Batch add-to-cart: **ya existe** en el SDK storefront (`Jumpseller.addMultipleProductsToCart`) — el deseo es exponerlo también a nivel de API/plataforma y como concepto de "pack".
  3. Tipo de producto `pack` nativo en vez de custom fields (idea BigCommerce).
  4. Selección de variante por el cliente (v1 solo admin; el parser ya entiende `?variant_id:`).
  5. Resolver el caso "componente comprado también suelto" (Jumpseller fusiona líneas idénticas por variante → agrupado/borrado ambiguo). La membresía server-side lo resuelve.
  6. Promociones a nivel de pack.
  7. Podría vivir en una App, pero lo ideal es soporte nativo.
- **Mapa de la implementación demo** (qué archivo hace qué) para que un ingeniero la lea rápido.

- [ ] **Step 2: Commit**

```bash
git add docs/wishlist-para-ingenieros.md
git commit -m "docs: wishlist para ingenieros (handoff)"
```

---

## Self-Review (completed)

**Spec coverage:**
- Pack = virtual $0 product + custom field → Task 2 (data) + Task 6 (render). ✅
- `bundle_components` permalink/variant format → Task 3 parser; compiled form `bundle_components_json` → Task 2. ✅
- Add-to-cart adds components, inventory decrements → Task 8 (+ stock check in Step 3). ✅
- Visual grouping on cart page only → Task 9. ✅
- Anchor price = sum of components → Task 9 (`sumPrices` + `formatPrice`). ✅
- Component qty locked, pack qty fixed 1 → Task 9. ✅
- Eliminar pack → all gone → Task 10. ✅
- Eliminar componente → break pack (anchor out, rest loose) → Task 11. ✅
- Setup via API/MCP, idempotent, throwaway → Task 2. ✅
- Testing: unit (parse/normalize/sum/format) + Playwright e2e → Tasks 3-5 + verify steps in 6-11. ✅
- Wishlist handoff → Task 12. ✅

**Placeholder scan:** No `TBD`/`TODO`/"handle edge cases". The two guidance notes (product-template render style in Task 6; `formatPrice` literal in Task 5) describe concrete decisions the engineer makes against real, inspectable code, not deferred work.

**Type/name consistency:** `BundleCore.parseBundleComponents/normalizePermalink/sumPrices/formatPrice`, `window.JBBundles.readStore/writeStore/saveMembership`, `window.initBundleCart`, `removeLines`, `rowPermalink`, `rowLineId`, `lockRowQuantity` — names are used consistently across Tasks 3-11. localStorage key `jb_bundles` and the membership schema match between Task 8 (`saveMembership`) and Tasks 9-11 (consumers).

**Known platform assumptions to validate during execution (not blockers, surfaced in verify steps):**
- `Jumpseller.addMultipleProductsToCart` tuple shape `[id, qty]` (confirmed from theme.js usage; e2e in Task 8 validates).
- The pack product page exposes `button#add-to-cart` (confirmed in `product-form.liquid:194/203`).
- Cart row `.store-product__price` is the element to overwrite for the anchor sum (confirmed in `store_product.liquid:79`).
