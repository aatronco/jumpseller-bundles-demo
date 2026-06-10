/* bundles.js — bundle (pack) behavior for the storefront.
   Depends on: window.BundleCore (bundle-core.js), the global Jumpseller SDK, and the theme
   globals refreshCartDisplay() / ToastNotification / I18N / ORDER (from theme.js).

   SINGLE SOURCE OF TRUTH: the `bundle_components` custom field (permalinks + optional
   ?qty:/?variant_id:). Nothing is precomputed — component product ids/prices are resolved at
   runtime, and the pack's displayed price is the sum of LIVE component prices × qty (so
   price/promotion changes never go stale).

   Product page: <product-bundle> shows the summed pack price (replacing the $0 anchor price)
   and intercepts add-to-cart, batch-adding the $0 anchor + components via the SDK.
   Cart page: groups the pack's rows under the anchor, sums the live line prices × qty onto the
   anchor, locks component quantities, supports atomic removal (remove pack → all gone; remove a
   component → break pack, anchor out + rest loose), and re-groups automatically when the cart
   re-renders (e.g. after adding another product). */
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

  // membership stores stable refs (permalink + qty + variant); price is always read live.
  function saveMembership(pack, components) {
    var store = readStore();
    store[BundleCore.normalizePermalink(pack.url)] = {
      name: pack.name,
      components: components.map(function (c) {
        return {
          permalink: BundleCore.normalizePermalink(c.permalink),
          variantId: c.variantId || null,
          qty: c.qty && c.qty > 0 ? c.qty : 1,
        };
      }),
    };
    writeStore(store);
  }

  // ---------- runtime permalink -> {id, price} resolution ----------
  var resolveCache = {};
  function resolveComponent(permalink) {
    if (permalink in resolveCache) return Promise.resolve(resolveCache[permalink]);
    return fetch("/" + permalink, { credentials: "same-origin" })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, "text/html");
        // product id: data-productid on .product-json (its content is the variants array,
        // empty for simple products, so we only read the attribute here).
        var idEl = doc.querySelector(".product-json");
        var id = idEl && idEl.dataset && idEl.dataset.productid ? parseInt(idEl.dataset.productid, 10) : null;
        if (!id) throw new Error("No pude resolver el producto: " + permalink);
        // effective unit price WITH product-level discount applied: read the storefront's own
        // discounted price (price_with_discount_formatted), which already reflects any product
        // sale/discount. Fallback to price - discount, then to price. (Cart-level promotions
        // are NOT product prices and intentionally don't appear here.)
        var price = 0;
        var priceEl = doc.querySelector(".product-price-json");
        if (priceEl) {
          try {
            var info0 = JSON.parse(priceEl.textContent).info.product;
            price = BundleCore.parsePrice(info0.price_with_discount_formatted);
            if (!price && typeof info0.price === "number") {
              price = info0.price - (typeof info0.discount === "number" ? info0.discount : 0);
            }
          } catch (_) { /* leave price 0 */ }
        }
        var info = { id: id, price: price };
        resolveCache[permalink] = info;
        return info;
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

  // Open the mini-cart drawer (native UX) after adding; fall back to navigating to the cart.
  function openCartDrawer() {
    var openDrawer = function () {
      try {
        if (typeof $ !== "undefined" && document.getElementById("sidebar-cart")) {
          $("#sidebar-cart").offcanvas("show");
          return;
        }
      } catch (e) {}
      window.location.href = (window.ORDER && window.ORDER.url) || "/cart";
    };
    if (typeof refreshCartDisplay === "function") {
      var p = refreshCartDisplay();
      if (p && typeof p.then === "function") p.then(openDrawer);
      else openDrawer();
    } else {
      openDrawer();
    }
  }

  // The active <cart-area> — the cart page's on /cart, otherwise the mini-cart drawer's.
  // (The theme renders only one at a time.) We group whichever is present.
  function mainCartArea() {
    return document.querySelector("cart-area");
  }

  // ---------- Product page: show summed price + intercept add-to-cart ----------
  function initProductBundle() {
    var node = document.querySelector("product-bundle .product-bundle-json");
    if (!node) return;
    var cfg;
    try { cfg = JSON.parse(node.textContent); } catch (e) { return; }
    if (!cfg || !cfg.pack) return;

    var parsed = BundleCore.parseBundleComponents(cfg.components_raw);
    if (!parsed.length) return;

    // Resolve all components once (ids + live prices), then both display the sum and wire add.
    var resolvedPromise = Promise.all(parsed.map(function (c) { return resolveComponent(c.permalink); }));

    // Show the summed pack price on the product page (replace the $0 anchor price),
    // and expose the resolved contract JSON for inspection (window.JBBundles.bundle).
    // This is the SAME shape the native backend will provide later (see
    // docs/contrato-json-para-disenadores.md) — today we resolve it client-side.
    resolvedPromise
      .then(function (infos) {
        window.JBBundles.bundle = {
          pack: cfg.pack,
          components: infos.map(function (info, i) {
            return {
              id: info.id,
              permalink: parsed[i].permalink,
              price: info.price,
              qty: parsed[i].qty,
              variant_id: parsed[i].variantId,
            };
          }),
        };
        var total = BundleCore.sumPrices(infos.map(function (info, i) { return info.price * parsed[i].qty; }));
        document.querySelectorAll(".product-page__price").forEach(function (el) {
          el.textContent = BundleCore.formatPrice(total, {});
        });
      })
      .catch(function () { /* leave the original price if resolution fails */ });

    var addBtn = document.querySelector("button#add-to-cart");
    if (!addBtn) return;
    addBtn.addEventListener(
      "click",
      function (e) {
        // Preempt the theme's own add-to-cart handler for this (pack) product.
        e.preventDefault();
        e.stopImmediatePropagation();

        var cartArea = document.querySelector("cart-area");
        if (cartArea && cartArea.setIsLoading) cartArea.setIsLoading(true);

        resolvedPromise
          .then(function (infos) {
            // NOTE: parsed[i].variantId is parsed but NOT wired into the add (v1 components are
            // simple/no-variant). Customer/admin variant selection is a documented wish for the
            // native version (docs/wishlist-para-ingenieros.md #4).
            var products = [[cfg.pack.id, 1]].concat(
              infos.map(function (info, i) { return [info.id, parsed[i].qty]; })
            );
            Jumpseller.addMultipleProductsToCart(products, {
              callback: function (data) {
                if (cartArea && cartArea.setIsLoading) cartArea.setIsLoading(false);
                if (data && data.status && data.status !== 200) {
                  toastError((data.responseJSON && data.responseJSON.message) || "");
                  return;
                }
                saveMembership(cfg.pack, parsed);
                openCartDrawer();
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
  // The effective (paid) unit price element of a cart row: discounted price if on sale,
  // otherwise the plain price (NOT the quantity badge, NOT the struck-through old price).
  function rowPriceEl(row) {
    return (
      row.querySelector(".store-product__price--new") ||
      row.querySelector(".store-product__price:not(.store-product__price--qty):not(.store-product__price--old)")
    );
  }
  function rowQty(row) {
    var input = row.querySelector(".store-product__input");
    var q = input ? parseInt(input.value || input.getAttribute("data-current"), 10) : 1;
    return q && q > 0 ? q : 1;
  }
  // A cart row's contribution to the pack total = effective unit price × quantity.
  function rowLineTotal(row) {
    var el = rowPriceEl(row);
    return el ? BundleCore.parsePrice(el.textContent) * rowQty(row) : 0;
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
  // Demo scope: no error/timeout path — if a Jumpseller.updateCart call never calls back
  // (e.g. network blip) the chain stalls; the user reloads. A production version should
  // add a per-call timeout/error handler so refreshCartDisplay always runs.
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
  // Set specific line items to specific quantities (qty 0 removes), then refresh once.
  function setLineQtys(pairs) {
    var remaining = pairs.slice();
    function next() {
      if (!remaining.length) {
        if (typeof refreshCartDisplay === "function") refreshCartDisplay();
        return;
      }
      var pair = remaining.shift();
      Jumpseller.updateCart(pair[0], pair[1], { callback: function () { next(); } });
    }
    next();
  }
  function rowUnitPrice(row) {
    var el = rowPriceEl(row);
    return el ? BundleCore.parsePrice(el.textContent) : 0;
  }
  // Cosmetically set a row's displayed quantity (stepper input + the "N ✕" qty badge).
  function setRowQtyDisplay(row, n) {
    var input = row.querySelector(".store-product__input");
    if (input) { input.value = n; input.setAttribute("data-current", String(n)); }
    var badge = row.querySelector(".store-product__price--qty");
    if (badge && badge.firstChild && badge.firstChild.nodeType === 3) {
      badge.firstChild.textContent = " " + n + " ";
    }
  }
  function replaceClickHandler(el, handler) {
    // Drop the theme's existing (jQuery) click handler by cloning, then bind ours.
    var fresh = el.cloneNode(true);
    el.parentNode.replaceChild(fresh, el);
    fresh.addEventListener("click", handler);
    return fresh;
  }

  function groupCart() {
    var cartArea = mainCartArea();
    if (!cartArea) return;
    var store = readStore();
    var rows = Array.prototype.slice.call(cartArea.querySelectorAll(".store-product"));

    var byPermalink = {};
    rows.forEach(function (r) {
      var pl = rowPermalink(r);
      (byPermalink[pl] = byPermalink[pl] || []).push(r);
    });

    var mutated = false;

    // Packs present in the cart (their $0 anchor line is in the cart), in DOM order.
    var packs = [];
    Object.keys(store).forEach(function (anchorPl) {
      var anchorRows = byPermalink[anchorPl];
      if (!anchorRows || !anchorRows.length) { delete store[anchorPl]; mutated = true; return; }
      var anchorRow = anchorRows[0];
      if (anchorRow.dataset.jbGrouped === "1") return;
      packs.push({
        anchorPl: anchorPl,
        anchorRow: anchorRow,
        anchorLineId: rowLineId(anchorRow),
        N: rowQty(anchorRow), // number of whole packs of this kind (anchor line qty)
        components: store[anchorPl].components,
      });
    });

    if (packs.length) {
      // One shared cart line per component permalink (Jumpseller merges identical products into a
      // single line). We allocate its units across the packs that need it; the rest stays loose.
      var lineInfo = {};
      function lineFor(pl) {
        if (!(pl in lineInfo)) {
          var row = (byPermalink[pl] || [])[0] || null;
          lineInfo[pl] = row
            ? { lineId: rowLineId(row), lineQty: rowQty(row), unit: rowUnitPrice(row), row: row, remaining: rowQty(row), used: false }
            : null;
        }
        return lineInfo[pl];
      }

      // Removing/breaking a pack subtracts ONLY this pack's allocations (shared lines keep the
      // other packs' + loose portions), then removes its $0 anchor.
      function makeRemovePackHandler(pack) {
        return function (e) {
          e.preventDefault();
          e.stopImmediatePropagation();
          var s = readStore(); delete s[pack.anchorPl]; writeStore(s);
          var pairs = [];
          pack.components.forEach(function (c) {
            var li = lineInfo[c.permalink];
            if (li) pairs.push([li.lineId, li.lineQty - (pack.alloc[c.permalink] || 0)]);
          });
          pairs.push([pack.anchorLineId, 0]);
          setLineQtys(pairs);
        };
      }

      // ALLOCATE: count packs first, give each its share of every component; leftover = loose.
      packs.forEach(function (pack) {
        pack.alloc = {};
        pack.components.forEach(function (c) {
          var li = lineFor(c.permalink);
          if (!li) { pack.alloc[c.permalink] = 0; return; }
          var give = Math.min(pack.N * (c.qty || 1), li.remaining);
          li.remaining -= give;
          pack.alloc[c.permalink] = give;
        });
      });

      // RENDER each pack as its own .jb-pack group (two packs → two separate groups).
      var lastWrapper = null;
      packs.forEach(function (pack) {
        var wrapper = document.createElement("div");
        wrapper.className = "jb-pack";
        pack.anchorRow.parentNode.insertBefore(wrapper, pack.anchorRow);
        pack.anchorRow.classList.add("jb-pack__anchor");
        wrapper.appendChild(pack.anchorRow);
        lastWrapper = wrapper;

        var prices = [];
        pack.components.forEach(function (c) {
          var li = lineFor(c.permalink);
          if (!li) return;
          var qty = pack.alloc[c.permalink];
          if (qty <= 0) return;
          // first pack to use a shared line reuses the real row; the others clone it
          var rowEl, isOriginal;
          if (!li.used) { rowEl = li.row; li.used = true; isOriginal = true; }
          else { rowEl = li.row.cloneNode(true); isOriginal = false; }
          rowEl.classList.add("jb-pack__component");
          setRowQtyDisplay(rowEl, qty);
          lockRowQuantity(rowEl);
          wrapper.appendChild(rowEl);
          prices.push(qty * li.unit);

          var cdel = rowEl.querySelector(".store-product__delete");
          if (cdel) {
            if (isOriginal) replaceClickHandler(cdel, makeRemovePackHandler(pack));
            else cdel.addEventListener("click", makeRemovePackHandler(pack));
          }
        });

        var priceEl = rowPriceEl(pack.anchorRow);
        if (priceEl) priceEl.textContent = BundleCore.formatPrice(BundleCore.sumPrices(prices), {});

        var qtyWrap = pack.anchorRow.querySelector(".store-product__quantity");
        if (pack.N > 1) { setRowQtyDisplay(pack.anchorRow, pack.N); lockRowQuantity(pack.anchorRow); }
        else if (qtyWrap) { qtyWrap.style.display = "none"; }

        var del = pack.anchorRow.querySelector(".store-product__delete");
        if (del) {
          del.textContent = (window.I18N && I18N.remove_pack) || "Eliminar pack";
          replaceClickHandler(del, makeRemovePackHandler(pack));
        }

        pack.anchorRow.dataset.jbGrouped = "1";
      });

      // LOOSE rows for leftover units (a shared product bought beyond all packs' needs).
      Object.keys(lineInfo).forEach(function (pl) {
        var li = lineInfo[pl];
        if (!li || li.remaining <= 0) return;
        var loose = li.row.cloneNode(true);
        loose.classList.remove("jb-pack__component");
        loose.dataset.jbLoose = "1";
        setRowQtyDisplay(loose, li.remaining);
        lockRowQuantity(loose);
        if (lastWrapper) lastWrapper.parentNode.insertBefore(loose, lastWrapper.nextSibling);
        else cartArea.appendChild(loose);
        (function (lineId, keepQty) {
          var ldel = loose.querySelector(".store-product__delete");
          if (ldel) ldel.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopImmediatePropagation();
            setLineQtys([[lineId, keepQty]]); // drop the loose units, keep what the packs use
          });
        })(li.lineId, li.lineQty - li.remaining);
      });
    }

    // The $0 pack anchor is a phantom line — exclude it from the displayed item count so the
    // cart counts the real component units, not anchor + components. Recomputed from the DOM
    // (idempotent), only when a pack is present.
    if (cartArea.querySelector(".jb-pack__anchor")) {
      var realCount = 0;
      Array.prototype.forEach.call(cartArea.querySelectorAll(".store-product"), function (row) {
        if (!row.classList.contains("jb-pack__anchor")) realCount += rowQty(row);
      });
      var hdr = document.querySelector(".theme-cart-counter");
      if (hdr) {
        hdr.textContent = realCount;
        hdr.setAttribute("data-products-count", String(realCount));
      }
      Array.prototype.forEach.call(document.querySelectorAll(".store-totals__price--count"), function (el) {
        el.textContent = realCount;
      });
    }

    if (mutated) writeStore(store);
  }

  // Re-group after the theme re-renders <cart-area> (e.g. adding another product, qty change
  // elsewhere). We disconnect the observer while grouping so our own DOM moves don't recurse.
  var cartObserver = null;
  function observeCart() {
    var cartArea = mainCartArea();
    if (!cartArea || cartObserver) return;
    cartObserver = new MutationObserver(function () {
      cartObserver.disconnect();
      groupCart();
      cartObserver.observe(cartArea, { childList: true, subtree: true });
    });
    cartObserver.observe(cartArea, { childList: true, subtree: true });
  }

  // ---------- Product listings / cross-sell: pack product blocks ----------
  // A pack shown as a product card (category, search, "you might also like") would otherwise
  // show the $0 anchor price and its "Add" would add only the anchor. Here we add a PACK badge,
  // show the summed live price, and make "Add" batch-add the components.
  function initProductBlocks() {
    var blocks = document.querySelectorAll("article.product-block[data-bundle-components]");
    Array.prototype.forEach.call(blocks, function (block) {
      if (block.dataset.jbBlockDone === "1") return;
      var parsed = BundleCore.parseBundleComponents(block.getAttribute("data-bundle-components"));
      if (!parsed.length) return;
      block.dataset.jbBlockDone = "1";
      var packId = parseInt(block.getAttribute("data-product-id"), 10);

      // PACK badge
      if (!block.querySelector(".jb-pack-badge")) {
        var gallery = block.querySelector(".product-block__gallery") || block;
        var badge = document.createElement("span");
        badge.className = "jb-pack-badge";
        badge.textContent = "PACK";
        gallery.appendChild(badge);
      }

      // summed live price on the card
      Promise.all(parsed.map(function (c) { return resolveComponent(c.permalink); }))
        .then(function (infos) {
          var total = BundleCore.sumPrices(infos.map(function (info, i) { return info.price * parsed[i].qty; }));
          var priceEl =
            block.querySelector(".product-block__price--new") ||
            block.querySelector(".product-block__price:not(.product-block__price--old):not(.product-block__price--text):not(.product-block__price--tax-label)");
          if (priceEl) priceEl.textContent = BundleCore.formatPrice(total, {});
        })
        .catch(function () {});

      // intercept the block's add-to-cart (inline onclick) → batch-add components
      var addBtn = block.querySelector(".product-block__button--add-to-cart");
      if (addBtn) {
        addBtn.removeAttribute("onclick");
        addBtn.addEventListener(
          "click",
          function (e) {
            e.preventDefault();
            e.stopImmediatePropagation();
            Promise.all(parsed.map(function (c) { return resolveComponent(c.permalink); }))
              .then(function (infos) {
                var products = [[packId, 1]].concat(
                  infos.map(function (info, i) { return [info.id, parsed[i].qty]; })
                );
                Jumpseller.addMultipleProductsToCart(products, {
                  callback: function (data) {
                    if (data && data.status && data.status !== 200) {
                      toastError((data.responseJSON && data.responseJSON.message) || "");
                      return;
                    }
                    var anchor = block.querySelector(".product-block__anchor");
                    var nameEl = block.querySelector(".product-block__name");
                    saveMembership(
                      { id: packId, url: anchor ? anchor.getAttribute("href") : "", name: nameEl ? nameEl.textContent.trim() : "Pack" },
                      parsed
                    );
                    openCartDrawer();
                  },
                });
              })
              .catch(function (err) { toastError(String(err && err.message ? err.message : err)); });
          },
          true
        );
      }
    });
  }

  // The theme calls refreshCartDisplay() after every cart change and swaps the <cart-area> node
  // (orphaning any MutationObserver). Wrap it so grouping is re-applied after each refresh — this
  // is what keeps the MINI-CART DRAWER grouped (it re-renders on open/add/remove).
  function patchRefreshCartDisplay() {
    if (typeof window.refreshCartDisplay !== "function" || window.refreshCartDisplay.__jbWrapped) return;
    var orig = window.refreshCartDisplay;
    window.refreshCartDisplay = function () {
      var r = orig.apply(this, arguments);
      if (r && typeof r.then === "function") return r.then(function (v) { groupCart(); return v; });
      groupCart();
      return r;
    };
    window.refreshCartDisplay.__jbWrapped = true;
  }

  // ---------- bootstrap ----------
  function init() {
    patchRefreshCartDisplay();
    initProductBundle();
    initProductBlocks();
    groupCart();
    observeCart();
  }

  window.JBBundles = {
    readStore: readStore,
    writeStore: writeStore,
    saveMembership: saveMembership,
    groupCart: groupCart,
    resolveComponent: resolveComponent,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
