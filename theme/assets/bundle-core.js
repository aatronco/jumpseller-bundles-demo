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

  function normalizePermalink(input) {
    if (!input || typeof input !== "string") return "";
    let s = input.split("#")[0].split("?")[0]; // drop hash + query
    s = s.replace(/\/+$/, ""); // drop trailing slashes
    const parts = s.split("/").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : "";
  }

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

  // Parse a displayed integer-currency price string into a number.
  // Assumes a no-decimals currency (CLP) where dots/spaces are thousands separators:
  // "$7.500" -> 7500. Returns 0 for blank/unparseable input.
  function parsePrice(text) {
    if (!text || typeof text !== "string") return 0;
    const digits = text.replace(/[^\d]/g, "");
    return digits ? parseInt(digits, 10) : 0;
  }

  return { parseBundleComponents, normalizePermalink, sumPrices, formatPrice, parsePrice };
});
