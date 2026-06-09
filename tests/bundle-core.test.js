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
