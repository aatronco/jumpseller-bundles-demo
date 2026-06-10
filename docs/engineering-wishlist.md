# Bundles / Packs — Engineering wishlist

This demo (`alejandrotest`) shows **how a bundles/packs feature would look and behave** in a
Jumpseller store, built 100% in the theme (Liquid + JS), so the engineering team can take it to a
**native platform implementation**. The focus was **design and experience**, not tooling.

- Full design: [`docs/superpowers/specs/2026-06-09-bundles-demo-design.md`](superpowers/specs/2026-06-09-bundles-demo-design.md)
- Implementation plan: [`docs/superpowers/plans/2026-06-09-bundles-demo.md`](superpowers/plans/2026-06-09-bundles-demo.md)

---

## End-to-end flow — mockups (admin → purchase)

Wireframes of the **target native experience** (what we want engineering to build). They show the
4 stages from creating a pack in the admin to the inventory decrementing on purchase.

**① Admin — create the pack** *(today: a `bundle_components` custom field; target: a native `pack`
product type with a component picker, wish #3)*
```
┌─ Admin · New product ───────────────────────────────────┐
│ Type:  ( ) Physical   ( ) Digital   (•) Pack   ← NEW     │
│ Name:  [ Pack Queque Casero                          ]   │
│ ┌─ Components ─────────────────────────────────────┐     │
│ │  + Add component                                 │     │
│ │   • Harina (1Kg)         qty [2]   variant [ – ] │     │
│ │   • Huevo deshidratado   qty [1]   variant [ – ] │     │
│ │   • Mantequilla (250g)   qty [1]   variant [ – ] │     │
│ └──────────────────────────────────────────────────┘     │
│ Bundle discount:  [ 20 ] %        ← combo saving         │
│ Price:  auto = Σ(components) − discount  →  $7,600       │
│                                          [  Save pack  ]  │
└──────────────────────────────────────────────────────────┘
```

**② Storefront — product page** *(pack price = sum of components, with the bundle discount)*
```
┌─ /pack-queque-casero ───────────────────────────────────┐
│  ┌──────┐   Pack Queque Casero                          │
│  │ img  │   $7,600   ̶$̶9̶,̶5̶0̶0̶    (−20% pack)              │
│  └──────┘   Includes:                                   │
│               ↳ Harina (1Kg) ×2                         │
│               ↳ Huevo deshidratado ×1                   │
│               ↳ Mantequilla (250g) ×1                   │
│             [        Add pack to cart        ]          │
└──────────────────────────────────────────────────────────┘
```

**③ Cart — grouped pack with the discount applied per line**
```
┌─ Cart ──────────────────────────────────────────────────┐
│ ╔═ PACK ══════════════════════════════════════════════╗  │
│ ║ [img] Pack Queque Casero                  $7,600    ║  │
│ ║                                       [Remove pack] ║  │
│ ║   ↳ Harina (1Kg)        ×2   $1,600  ( ̶$̶2̶,̶0̶0̶0̶ )      ║  │
│ ║   ↳ Huevo deshidratado  ×1   $1,600  ( ̶$̶2̶,̶0̶0̶0̶ )      ║  │
│ ║   ↳ Mantequilla (250g)  ×1   $2,800  ( ̶$̶3̶,̶5̶0̶0̶ )      ║  │
│ ╚══════════════════════════════════════════════════════╝  │
│ Other loose product ×1                       $4,000     │
│ ─────────────────────────────────────────────────────── │
│ Subtotal                                     $11,600    │
│                                   [ Proceed to checkout ]│
└──────────────────────────────────────────────────────────┘
```

**④ Checkout → purchase → inventory** *(components are real line items; the $0 anchor only carries
the grouping)*
```
┌─ Order placed ──────────────────────────────────────────┐
│ Charged as real products (real stock decrements):       │
│    Harina ×2     Huevo ×1     Mantequilla ×1            │
│ Inventory:  Harina 10→8   Huevo 5→4   Mantequilla 8→7   │
│ Pack anchor ($0) → no stock impact, grouping only.      │
└──────────────────────────────────────────────────────────┘
```

**Product block (listings / cross-sell) — ✓ handled by the demo**
A pack shown as a product card (category page, search, "You might also like" cross-sell) gets a
**PACK** badge, shows the **summed live price** (not the $0 anchor), and its "Add" **batch-adds** the
components — implemented in `bundles.js` (`initProductBlocks`), marked in Liquid via
`product_block.liquid` (`data-bundle-components`). A native `pack` product type (#3) would do this
without the per-card runtime resolution.
```
┌─ Category / "You might also like" ──────────────────────┐
│   ┌────────┐    ┌────────┐    ┌──────────┐ PACK ← badge │
│   │  img   │    │  img   │    │   img    │              │
│   └────────┘    └────────┘    └──────────┘              │
│   Harina        Mantequilla   Pack Queque Casero        │
│   $2,000        $3,500        $7,600   ̶$̶9̶,̶5̶0̶0̶            │
│   [  Add  ]     [  Add  ]     [ Add pack ] ← batch-adds  │
│                                  ✓ live in the demo       │
└──────────────────────────────────────────────────────────┘
```

---

## What the demo does today (and its limits)

**A pack = a virtual product** (price 0, unlimited stock) with ONE custom field
`bundle_components` = comma-separated permalinks, optional `permalink?qty:N` / `permalink?variant_id:<id>`.
E.g.: `harina-1kg?qty:2,huevo-deshidratado-equivalente-a-5-huevos,mantequilla-250-g`.

Components are resolved **server-side in Liquid** — `partials/bundle_data.liquid` looks each one up
with `products.product[permalink]` (giving `.id`, `.price`, `.variants`), so every `<product-bundle>`
and pack product card carries its components already resolved (id, qty, variant_id, discounted unit
price). No client fetch. When the pack is added, `assets/bundles.js`:
1. reads those resolved components;
2. adds the $0 anchor + the components via `Jumpseller.addMultipleProductsToCart(...)`;
3. stores ONLY stable references (permalinks + qty) in `localStorage`, never prices;
4. on the cart page, groups the lines under the anchor, **sums the real cart-line prices**
   (with promotions applied, always current), locks component quantities, and wires "Remove pack"
   (atomic) and "remove a component → break the pack".

The product page shows the **summed pack price** (instead of the $0 anchor) = Σ (discounted unit ×
qty), from the Liquid-resolved component prices.

**Product cards (listings / cross-sell):** a pack card gets a **PACK** badge, the summed price, and
an "Add" that batch-adds the components (`bundles.js` `initProductBlocks`, reading the Liquid-resolved
`.jb-pack-data` script on the card).

**Cart split:** if a component is also bought standalone (so Jumpseller merges it into one line),
the merged line is split visually into the pack portion + a separate **loose row** (cosmetic — the
line stays merged server-side; see limits and #5).

**Known demo limits (to solve in the native version):**
- Membership lives in `localStorage` → **per-device**, lost if the browser is cleared.
- Component resolution is **server-side in Liquid** (`products.product[permalink]`) — instant, no
  client fetch. (An earlier version fetched each product's HTML client-side; it caused 504s on
  listings with several packs and was removed.)
- If a component is also bought **standalone**, Jumpseller merges both into a single cart line. The
  demo **splits it visually** (pack portion in the group + a separate loose row), but it's cosmetic
  — the line stays merged server-side (one line at checkout). See #5.
- Grouping applies on the **cart page** AND the **mini-cart drawer** (`#sidebar-cart`); product
  cards (listings/cross-sell) get the PACK badge + summed price + batch-add. Checkout is a
  non-editable React SPA, so it shows the raw component lines — but inventory and totals are still
  correct (components are real line items).

---

## Wishes for the native version

### 1. Native pack relationship + grouped `order.products`
Component resolution turned out to be **already possible**: Liquid resolves a product by permalink
via `products.product[permalink]` (`.id`, `.price`, `.variants`), so the demo resolves components
**server-side** (no client fetch). What's still missing is the **relationship and the cart grouping**:
today the pack→components link lives in a custom field, and which cart lines form a pack lives in
`localStorage` (per-device). **Wish:** store the pack relationship server-side and expose the
**groups inside the cart's `order.products`** in Liquid, so grouping is device-independent and
doesn't rely on `localStorage` or DOM manipulation.

> ⚠️ **Lesson from the demo (don't cache prices):** an early version stored compiled
> name/price/image in a custom field. **Wrong:** if a component's price changes, the cache goes
> stale. The rule is **store only stable references (id/permalink/variant) and always read
> price/stock live.** The native version must respect this.

### 2. Native batch add-to-cart
The storefront **already has** `Jumpseller.addMultipleProductsToCart([[id,qty],...], {callback})`
and we use it. **Wish:** expose that batch-add at the **API/platform** level too, and as a "pack"
concept (adding the pack adds its components as one atomic operation, not N calls).

### 3. Native `pack` product type (instead of custom fields)
Instead of encoding components in a text custom field, a first-class **`pack` product type**
(idea borrowed from BigCommerce), with its own admin editor to pick components and variants. The
$0 anchor would no longer be a hack.

### 4. Customer variant selection
In v1 variants are admin-only (the parser already understands `?variant_id:`). **Wish:** let the
customer choose each component's variant on the storefront (e.g. size, color).

### 5. Improve the cart line model: pack membership + no forced merge — THE core request
Today Jumpseller merges identical product+variant into **one cart line**. So a pack (Harina ×2) +
a standalone Harina ×1 collapse into one line of qty 3 with a single `line_id`. Worse, with **two
packs that share a component** — e.g. "Pack Queque Casero" needs Harina ×2 and "Pack 5 Harinas"
needs Harina ×5 — all 7 Harinas merge into **one** line, even though they belong to different packs.

The correct behavior the merchant expects: count the packs, give each its share of every component,
and whatever is left over is a separate loose line — across cart, checkout and order.

**Demo workaround (cosmetic):** `bundles.js` does exactly that allocation on the cart page (count
packs → give each its share → leftover stays loose) and renders the portions by **cloning the row**
(pack A shows Harina ×2, pack B shows Harina ×5, extras show as a loose row). Removing/breaking a
pack subtracts only its allocation. **But it's display-only** — server-side it stays one merged
line, so at checkout the split disappears (one line of qty 7).

**Wish (the single most important backend change for packs):** cart line items should carry **pack
membership** and **not be force-merged** when they belong to a pack — so each pack's components are
genuinely separate lines (real allocation across multiple packs + leftovers) **end to end (cart →
checkout → order)**, instead of the cosmetic clone hack the demo uses.

### 6. Pack discount → A NATIVE PACK PROMOTION IS NEEDED
The bundle saving (e.g. **20% off the components when the pack is in the cart**) must be a
**platform** discount, NOT theme logic (the theme/JS can't change what's charged, only display it).
**Conclusion after testing the current engine: the existing promotions are NOT enough — a native
"pack" promotion/concept is needed.**

**Evidence (tested live on `alejandrotest`, 2026-06-09):** we tried to model it with `buy_x_get_y`
promotions (X = the pack product, Y = a component):
- One promo with Y = the 3 components → discounts **only 1** (the cheapest), not all three.
- Three separate promos (X=pack, Y=harina / Y=huevo / Y=mantequilla), all `cumulative:true` →
  **only one fires** (the harina one). Cause: `buy_x_get_y` **consumes 1 unit of X (the pack)** per
  application; with a single pack in the cart, the other two promos have no trigger left.
- (A "2x Harina" promo did manage to discount both harina units, but the "all components" problem
  remains.)

**Why it matters:** there's no clean way to express "1 pack ⇒ ALL its components at N% off" with the
current engine without hacks (putting components in a dedicated category + a `target=categories`
promo conditioned on the pack, which is fragile and mixes concepts). A native **`pack` product type**
(see wish #3) with its own combo discount would solve it at the root.

**API note:** creating `buy_x_get_y` promotions via the API fails (`Condition_qty must be >= 1`) —
appears to be admin-only. The `discount_target` for specific products is `buy_x_get_y` (not
`products`).

**The good part (theme side):** the cart already reads each line's real price, so **any** discount
the platform applies is reflected in the pack total **automatically, without touching the theme**.
The only separate decision: whether the **product page** should preview the discounted price (the
front-end would need to know the %).

### 7. Pack stock derived from its components
**Left open by the user:** what happens if a component is out of stock? Today we rely on the SDK's
add-to-cart already blocking it (the callback returns `data.status ≠ 200`). **Wish:** have the pack
show availability derived from the **minimum** stock of its components (not purchasable if any is
sold out), with a clear message on the pack page.

### 8. App or native?
All of this **could** live in a Jumpseller App, but ideally it's **native platform support** so any
theme benefits without installing anything.

---

## Demo implementation map (for a quick read)

| File | Role |
|---|---|
| `theme/partials/bundle_data.liquid` | Resolves `bundle_components` server-side via `products.product[permalink]` → JSON array of `{id, permalink, qty, variant_id, price}` (discounted unit). Used by both the product page and product cards. |
| `theme/partials/product_bundle.liquid` | Emits `<product-bundle>` + JSON (pack id/url/name + resolved `components` from `bundle_data`) when the product has the field. |
| `theme/assets/bundle-core.js` | Pure functions (UMD, tested): `parseBundleComponents`, `normalizePermalink`, `sumPrices`, `formatPrice`, `parsePrice`. |
| `theme/assets/bundles.js` | Browser glue: consumes the Liquid-resolved components, intercepts add-to-cart (product page + product blocks), batch-add, groups the cart, live sum, multi-pack allocation + splits merged component lines (pack portion + loose row), atomic remove / break pack, opens the mini-cart drawer. Exposes the resolved contract as `window.JBBundles.bundle`. |
| `theme/assets/bundles-cart.css` | Visual grouping (`.jb-pack` box, "PACK" badge, indented components) + product-card `.jb-pack-badge`. |
| `theme/partials/product_block.liquid` | Adds `data-bundle-components` to pack product cards (listings/cross-sell) so `bundles.js` can badge them, show the summed price, and batch-add. |
| `theme/components/product-form.liquid` | Includes `{% render 'product_bundle' %}` at the end of the form. |
| `theme/components/product-fields.liquid` | Hides `bundle_components` from the customer-facing details. |
| `theme/templates/layout.liquid` | Loads `bundle-core.js` + `bundles.js` after `theme.js`. |
| `scripts/setup-demo-bundles.mjs` | Seeds the demo data (custom field + pack `pack-queque-casero` + value). Throwaway. |
| `tests/bundle-core.test.js` | Unit tests for the pure logic (`npm test`). |

**Demo data on `alejandrotest`:** custom field `bundle_components` (id 88114); pack
`pack-queque-casero` (id 35681868, $0) with components Harina ($2,000) + Huevo deshidratado
($2,000) + Mantequilla ($3,500). Three disabled `buy_x_get_y` pack promos exist for reference
(889140 / 889168 / 889169).
