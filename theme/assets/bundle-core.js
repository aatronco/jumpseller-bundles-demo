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

  return { parseBundleComponents, normalizePermalink };
});
