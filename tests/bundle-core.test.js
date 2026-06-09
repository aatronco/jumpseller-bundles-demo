const test = require("node:test");
const assert = require("node:assert/strict");
const BundleCore = require("../theme/assets/bundle-core.js");

test("parseBundleComponents: permalinks, optional variant ids, default qty 1", () => {
  const out = BundleCore.parseBundleComponents(
    "remera-basica?variant_id:1234567, gorro-lana ,medias-pack3?variant_id:7654321"
  );
  assert.deepEqual(out, [
    { permalink: "remera-basica", variantId: "1234567", qty: 1 },
    { permalink: "gorro-lana", variantId: null, qty: 1 },
    { permalink: "medias-pack3", variantId: "7654321", qty: 1 },
  ]);
});

test("parseBundleComponents: qty param", () => {
  assert.deepEqual(BundleCore.parseBundleComponents("harina-1kg?qty:2,gorro-lana"), [
    { permalink: "harina-1kg", variantId: null, qty: 2 },
    { permalink: "gorro-lana", variantId: null, qty: 1 },
  ]);
});

test("parseBundleComponents: qty + variant chained (either separator)", () => {
  assert.deepEqual(BundleCore.parseBundleComponents("remera?variant_id:999?qty:3"), [
    { permalink: "remera", variantId: "999", qty: 3 },
  ]);
  assert.deepEqual(BundleCore.parseBundleComponents("remera?qty:3&variant_id:999"), [
    { permalink: "remera", variantId: "999", qty: 3 },
  ]);
});

test("parseBundleComponents: invalid/zero qty → 1", () => {
  assert.deepEqual(BundleCore.parseBundleComponents("x?qty:0,y?qty:abc"), [
    { permalink: "x", variantId: null, qty: 1 },
    { permalink: "y", variantId: null, qty: 1 },
  ]);
});

test("parseBundleComponents: empty / blank input → []", () => {
  assert.deepEqual(BundleCore.parseBundleComponents(""), []);
  assert.deepEqual(BundleCore.parseBundleComponents(null), []);
  assert.deepEqual(BundleCore.parseBundleComponents("  , ,"), []);
});

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

test("parsePrice: CLP text → integer", () => {
  assert.equal(BundleCore.parsePrice("$7.500"), 7500);
  assert.equal(BundleCore.parsePrice("$1.234.567"), 1234567);
  assert.equal(BundleCore.parsePrice("2000"), 2000);
  assert.equal(BundleCore.parsePrice(""), 0);
  assert.equal(BundleCore.parsePrice(null), 0);
});

test("parsePrice/formatPrice round-trip (CLP)", () => {
  assert.equal(BundleCore.formatPrice(BundleCore.parsePrice("$7.500"), {}), "$7.500");
});
