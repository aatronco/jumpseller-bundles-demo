/* bundles.js — bundle (pack) behavior for the storefront.
   Depends on: window.BundleCore (bundle-core.js), the global Jumpseller SDK, and the theme
   globals refreshCartDisplay() / ToastNotification / I18N / ORDER (from theme.js).

   SINGLE SOURCE OF TRUTH: the `bundle_components` custom field (permalinks). Nothing is
   precomputed — component product ids are resolved at runtime, and the pack's displayed
   price is summed from the LIVE cart line prices (so price/promotion changes never go stale).

   Product page: <product-bundle> intercepts add-to-cart, resolves each component permalink
   to its product id, and batch-adds the $0 pack anchor + components via the SDK, recording
   membership (permalinks only) in localStorage.
   Cart page: groups the pack's rows under the anchor, sums the live component prices onto the
   anchor, locks component quantities, and wires removal (whole pack atomically; removing a
   single component breaks the pack — anchor out, the rest stay as loose lines). */
(function () {
  "use strict";

  var STORAGE_KEY = "jb_bundles";

  function readStore() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
    catch (e) { return {}; }
  }
  function writeStore(store) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  // membership stores ONLY stable refs (permalinks); price is always read live.
  function saveMembership(pack, components) {
    var store = readStore();
    store[BundleCore.normalizePermalink(pack.url)] = {
      name: pack.name,
      components: components.map(function (c) {
        return { permalink: BundleCore.normalizePermalink(c.permalink), variantId: c.variantId || null };
      }),
    };
    writeStore(store);
  }

  // ---------- runtime permalink -> product id resolution ----------
  var idCache = {};
  function resolveComponentId(permalink) {
    if (idCache[permalink]) return Promise.resolve(idCache[permalink]);
    return fetch("/" + permalink, { credentials: "same-origin" })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, "text/html");
        var el = doc.querySelector(".product-json");
        var id = el && el.dataset && el.dataset.productid ? parseInt(el.dataset.productid, 10) : null;
        if (!id) throw new Error("No pude resolver el producto: " + permalink);
        idCache[permalink] = id;
        return id;
      });
  }

  function toastError(message) {
    try {
      new ToastNotification({
        type: "error",
        title: (window.I18N && I18N.error_adding_to_cart) || "Error",
        message: message || "",
      });
    } catch (_) { /* theme toast unavailable */ }
  }

  // ---------- Product page: intercept add-to-cart ----------
  function initProductBundle() {
    var node = document.querySelector("product-bundle .product-bundle-json");
    if (!node) return;
    var cfg;
    try { cfg = JSON.parse(node.textContent); } catch (e) { return; }
    var addBtn = document.querySelector("button#add-to-cart");
    if (!addBtn || !cfg || !cfg.pack) return;

    var parsed = BundleCore.parseBundleComponents(cfg.components_raw);
    if (!parsed.length) return;

    addBtn.addEventListener(
      "click",
      function (e) {
        // Preempt the theme's own add-to-cart handler for this (pack) product.
        e.preventDefault();
        e.stopImmediatePropagation();

        var cartArea = document.querySelector("cart-area");
        if (cartArea && cartArea.setIsLoading) cartArea.setIsLoading(true);

        Promise.all(parsed.map(function (c) { return resolveComponentId(c.permalink); }))
          .then(function (ids) {
            var products = [[cfg.pack.id, 1]].concat(ids.map(function (id) { return [id, 1]; }));
            Jumpseller.addMultipleProductsToCart(products, {
              callback: function (data) {
                if (cartArea && cartArea.setIsLoading) cartArea.setIsLoading(false);
                if (data && data.status && data.status !== 200) {
                  toastError((data.responseJSON && data.responseJSON.message) || "");
                  return;
                }
                saveMembership(cfg.pack, parsed);
                window.location.href = (window.ORDER && window.ORDER.url) || "/cart";
              },
            });
          })
          .catch(function (err) {
            if (cartArea && cartArea.setIsLoading) cartArea.setIsLoading(false);
            toastError(String(err && err.message ? err.message : err));
          });
      },
      true // capture phase: runs before the theme's bubble-phase jQuery handler
    );
  }

  // ---------- Cart page: group, sum, lock, remove ----------
  function rowPermalink(row) {
    var a = row.querySelector(".store-product__anchor");
    return a ? BundleCore.normalizePermalink(a.getAttribute("href")) : "";
  }
  function rowLineId(row) {
    return row.getAttribute("data-id");
  }
  // The effective (paid) price element of a cart row: the discounted price if on sale,
  // otherwise the plain price (NOT the quantity badge, NOT the struck-through old price).
  function rowPriceEl(row) {
    return (
      row.querySelector(".store-product__price--new") ||
      row.querySelector(".store-product__price:not(.store-product__price--qty):not(.store-product__price--old)")
    );
  }
  function rowPriceValue(row) {
    var el = rowPriceEl(row);
    return el ? BundleCore.parsePrice(el.textContent) : 0;
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
  // Remove cart line items one after another, then refresh the cart once.
  function removeLines(lineIds) {
    var remaining = lineIds.slice();
    function next() {
      if (!remaining.length) {
        if (typeof refreshCartDisplay === "function") refreshCartDisplay();
        return;
      }
      Jumpseller.updateCart(remaining.shift(), 0, { callback: function () { next(); } });
    }
    next();
  }
  function replaceClickHandler(el, handler) {
    // Drop the theme's existing (jQuery) click handler by cloning, then bind ours.
    var fresh = el.cloneNode(true);
    el.parentNode.replaceChild(fresh, el);
    fresh.addEventListener("click", handler);
    return fresh;
  }

  function groupCart() {
    var cartArea = document.querySelector("cart-area");
    if (!cartArea) return;
    var store = readStore();
    var rows = Array.prototype.slice.call(cartArea.querySelectorAll(".store-product"));

    var byPermalink = {};
    rows.forEach(function (r) {
      var pl = rowPermalink(r);
      (byPermalink[pl] = byPermalink[pl] || []).push(r);
    });

    var mutated = false;
    Object.keys(store).forEach(function (anchorPl) {
      var entry = store[anchorPl];
      var anchorRows = byPermalink[anchorPl];
      if (!anchorRows || !anchorRows.length) { delete store[anchorPl]; mutated = true; return; }
      var anchorRow = anchorRows[0];
      if (anchorRow.dataset.jbGrouped === "1") return;

      var wrapper = document.createElement("div");
      wrapper.className = "jb-pack";
      anchorRow.parentNode.insertBefore(wrapper, anchorRow);
      anchorRow.classList.add("jb-pack__anchor");
      wrapper.appendChild(anchorRow);

      var prices = [];
      var groupLineIds = [rowLineId(anchorRow)];

      entry.components.forEach(function (c) {
        (byPermalink[c.permalink] || []).forEach(function (cr) {
          cr.classList.add("jb-pack__component");
          lockRowQuantity(cr);
          wrapper.appendChild(cr);
          prices.push(rowPriceValue(cr)); // LIVE price from the cart line
          groupLineIds.push(rowLineId(cr));

          var cdel = cr.querySelector(".store-product__delete");
          if (cdel) {
            replaceClickHandler(cdel, function (e) {
              // break the pack: remove this component + the $0 anchor; leave the rest loose.
              e.preventDefault();
              e.stopImmediatePropagation();
              var s = readStore(); delete s[anchorPl]; writeStore(s);
              removeLines([rowLineId(cr), rowLineId(anchorRow)]);
            });
          }
        });
      });

      var priceEl = rowPriceEl(anchorRow);
      if (priceEl) priceEl.textContent = BundleCore.formatPrice(BundleCore.sumPrices(prices), {});

      var qtyWrap = anchorRow.querySelector(".store-product__quantity");
      if (qtyWrap) qtyWrap.style.display = "none";

      var del = anchorRow.querySelector(".store-product__delete");
      if (del) {
        del.textContent = (window.I18N && I18N.remove_pack) || "Eliminar pack";
        replaceClickHandler(del, function (e) {
          e.preventDefault();
          e.stopImmediatePropagation();
          var s = readStore(); delete s[anchorPl]; writeStore(s);
          removeLines(groupLineIds);
        });
      }

      anchorRow.dataset.jbGrouped = "1";
    });
    if (mutated) writeStore(store);
  }

  // ---------- bootstrap ----------
  function init() {
    initProductBundle();
    groupCart();
  }

  window.JBBundles = {
    readStore: readStore,
    writeStore: writeStore,
    saveMembership: saveMembership,
    groupCart: groupCart,
    resolveComponentId: resolveComponentId,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
