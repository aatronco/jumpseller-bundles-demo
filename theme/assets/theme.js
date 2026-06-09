const I18N = window.theme.translations;
const OPTIONS = window.theme.options;
const IS_PREVIEW = window.theme.is_preview;
const ORDER = window.theme.order;

/* ----- Utilities ----- */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function animationObserverBehavior() {
  if (!window.AOS) return;
  const debouncedRefresh = debounce(() => AOS.refresh(), 150);
  new ResizeObserver(debouncedRefresh).observe(document.body);
}

function updateAutoCompletePosition() {
  if (document.querySelector(".header[data-fixed='true']")) return;

  window.addEventListener("scroll", () => {
    const autocomplete = document.querySelector(".aa-InputWrapper");
    if (!autocomplete) return;

    const resultsPanel = document.querySelector(".aa-Panel");
    if (!resultsPanel) return;

    const rect = autocomplete.getBoundingClientRect();
    resultsPanel.style.setProperty("top", `${rect.y + autocomplete.offsetHeight}px`, "important");
    resultsPanel.style.zIndex = "10";
  });
}

function localizedFetch(url, options) {
  if (typeof url !== "string" || !url.startsWith("/")) {
    return fetch(url, options);
  }

  // if the document language appears in the URL, add it to the fetch URL
  const lang = document.documentElement.lang;
  const locale = document.location.pathname.split("/")[1] || undefined;

  if (lang && lang === locale && !url.startsWith(`/${lang}`)) {
    url = `/${lang}${url}`;
  }

  return fetch(url, options);
}

function openUrlInPopup(url, title = "Share", w = 640, h = 300) {
  return !window.open(url, title, `width=${w},height=${h}`);
}

function copyToClipboard(str, useAlert = false) {
  navigator.clipboard.writeText(str);
  console.info("Copied to clipboard:", str);
  if (useAlert)
    new ToastNotification({
      type: "success",
      title: I18N.success,
      message: `Copied to clipboard: <strong>${str}</strong>`,
    });
}

function smoothScrollToElement(selector) {
  const element = document.querySelector(selector);
  window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - 200, behavior: "smooth" });
}

function footerScrollLink() {
  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}

function updateFormAction(buttonElement, action_url) {
  const form = buttonElement.closest("form");
  form.action = action_url;
}

function productBlockBuyNow(buttonElement, actionUrl) {
  const productBlock = buttonElement.closest(".product-block");
  const form = productBlock.querySelector(".product-block__form");

  form.action = actionUrl;
  form.submit();
}

function formatTranslation(translation, args) {
  return translation.replace(/%\{([\d\w_-]+)\}/g, (_, key) => args[key]);
}

function formatAddedCartProduct(name, qty) {
  return formatTranslation(qty == 1 ? I18N.added_singular : I18N.added_qty_plural, { qty, name });
}

function ensureStylesheetAsset({ url, integrity, crossOrigin = "anonymous", parent = document.head }) {
  if (!url) return Promise.resolve();

  const existing = document.querySelector(`link[href="${url}"]`);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    if (integrity) {
      link.integrity = integrity;
      link.crossOrigin = crossOrigin;
    } else if (crossOrigin && crossOrigin !== "anonymous") {
      link.crossOrigin = crossOrigin;
    }

    link.addEventListener("load", () => resolve(link), { once: true });
    link.addEventListener(
      "error",
      () => {
        console.error(`Failed to load stylesheet: ${url}`);
        resolve(link);
      },
      { once: true },
    );

    (parent || document.head).appendChild(link);
  });
}

function ensureScriptAsset({ url, integrity, crossOrigin = "anonymous", async = true, parent = document.body }) {
  if (!url) return Promise.resolve();

  return new Promise((resolve) => {
    const existing = document.querySelector(`script[src="${url}"]`);
    if (existing) {
      if (
        existing.dataset.assetLoaded === "true" ||
        existing.readyState === "complete" ||
        existing.readyState === "loaded"
      ) {
        resolve(existing);
        return;
      }

      existing.addEventListener("load", () => resolve(existing), { once: true });
      existing.addEventListener(
        "error",
        () => {
          console.error(`Failed to load script: ${url}`);
          resolve(existing);
        },
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = url;
    script.async = async;
    if (integrity) {
      script.integrity = integrity;
      script.crossOrigin = crossOrigin;
    } else if (crossOrigin && crossOrigin !== "anonymous") {
      script.crossOrigin = crossOrigin;
    }

    script.addEventListener(
      "load",
      () => {
        script.dataset.assetLoaded = "true";
        resolve(script);
      },
      { once: true },
    );

    script.addEventListener(
      "error",
      () => {
        console.error(`Failed to load script: ${url}`);
        resolve(script);
      },
      { once: true },
    );

    (parent || document.body).appendChild(script);
  });
}

function canBuyNow({ minQuantity, quantity, price }) {
  const quantityFallback = quantity || document.querySelector(".product-form__quantity input#input-qty")?.value || 1;
  const minQuantityFallback = minQuantity || +document.querySelector("#input-qty")?.attributes["min"]?.value || 1;

  if (quantityFallback < minQuantityFallback) return false; // selected less than minimum quantity to buy individual product

  const conditionType = window.theme.order.minimumPurchase.conditionType;
  const conditionValue = +window.theme.order.minimumPurchase.conditionValue;
  switch (conditionType) {
    case "qty":
      return quantityFallback >= conditionValue;
    case "price":
      if (!price) {
        console.error("price is null in canBuyNow");
        return false;
      }
      return price * quantityFallback >= conditionValue;
    default:
      return true;
  }
}

/* ----- Add to cart ----- */
function addToCartNotification(productName, qty) {
  if (!OPTIONS.display_cart_notification) return;
  const productNameBold = `<strong>${productName}</strong>`;
  const cartLink = ORDER?.url || "/cart";
  new ToastNotification({
    type: "success",
    title: I18N.success_adding_to_cart,
    message: `<span class="d-block">${formatAddedCartProduct(productNameBold, qty)}</span>
      <a href="${cartLink}" class="toast-notification__link">${I18N.go_to_cart}</a>`,
  });
}

function showAddToCartError(data) {
  if (!data.status || data.status == 200) return false;
  new ToastNotification({
    type: "error",
    title: I18N.error_adding_to_cart,
    message: data.responseJSON.message,
  });
  return true;
}

function hasSidebarCart() {
  return Boolean(document.getElementById("sidebar-cart"));
}

function updateHeaderCartCounter(count) {
  const headerCartCounter = document.querySelector(".theme-cart-counter");
  if (!headerCartCounter) return;

  headerCartCounter.innerHTML = count;
  headerCartCounter.setAttribute("data-products-count", count);
}

function getCartCount() {
  const counter = document.querySelector(".theme-cart-counter");
  return counter ? Number(counter.textContent) : 0;
}

async function handleAddToCart({ productsCount, onNotify, refreshCart = false }) {
  const prevCount = getCartCount();
  if (refreshCart) await refreshCartDisplay();

  updateHeaderCartCounter(productsCount);

  if (!hasSidebarCart()) {
    onNotify();
  } else if (prevCount === 0) {
    $("#sidebar-cart").offcanvas("show");
  } else {
    onNotify();
  }
}

async function normalAddToCartCallback(data, productName, qty) {
  if (showAddToCartError(data)) return;

  await handleAddToCart({
    productsCount: data.products_count,
    refreshCart: hasSidebarCart(),
    onNotify: () => addToCartNotification(productName, qty),
  });
}

function addMultipleToCart(products, productNames) {
  const callback = async (data) => {
    if (showAddToCartError(data)) return;

    const cartLink = ORDER?.url || "/cart";
    const joinedProductsMsg = products
      .map((prod, index) => formatAddedCartProduct(productNames[index], prod[1]))
      .join("<br>");

    await handleAddToCart({
      productsCount: data.products_count,
      refreshCart: true,
      onNotify: () =>
        new ToastNotification({
          type: "success",
          title: I18N.success_adding_to_cart,
          message: `<span class="d-block">${joinedProductsMsg}</span>
         <a href="${cartLink}" class="toast-notification__link">${I18N.go_to_cart}</a>`,
        }),
    });
  };

  Jumpseller.addMultipleProductsToCart(products, { callback });
}

async function storeProductAddToCartCallback(data, productName, qty, productId) {
  if (data.status && data.status != 200) {
    return new ToastNotification({
      type: "error",
      title: I18N.error_adding_to_cart,
      message: data.responseJSON.message,
    });
  }

  await refreshCartDisplay();
  const csp = document.querySelector(`.cross-selling-products .store-product[data-id="${productId}"]`);
  if (!csp) {
    const productsCount = data.products_count;
    if (productsCount === 1) $("#sidebar-cart").offcanvas("show");
    else addToCartNotification(productName, qty);

    return;
  }

  csp.remove();
  const csps = document.querySelector(".cross-selling-products");
  if (csps.children.length === 0) csps.closest(".theme-section").classList.add("hidden");
}

function addToCart(id, productName, qty, options, callbackSource = "normal", callbackParams = {}) {
  const cartArea = document.querySelector("cart-area");
  if (cartArea) cartArea.setIsLoading(true);
  qty = parseInt(qty);
  Jumpseller.addProductToCart(id, qty, options, {
    callback: function (data) {
      if (cartArea) cartArea.setIsLoading(false);
      switch (callbackSource) {
        case "normal":
          normalAddToCartCallback(data, productName, qty);
          break;
        case "store-product":
          storeProductAddToCartCallback(data, productName, qty, callbackParams?.id);
          break;
        default:
          break;
      }
    },
  });
}

async function refreshCartDisplay() {
  const cart = document.querySelector("cart-area");
  if (!cart) return;

  cart.setIsLoading(true);

  try {
    const response = await localizedFetch("/?sections=header");
    if (!response.ok) return;

    const header = await response.text();
    const dom = new DOMParser().parseFromString(header, "text/html");

    const fetchedCart = dom.querySelector("cart-area");

    if (!fetchedCart) return;

    const cartEmpty = !dom.querySelector("#sidebar-cart.has-items");
    const template = window.theme.template;

    const setInnerHTML = (docEl, sectionEl) => {
      if (docEl && sectionEl) docEl.innerHTML = sectionEl.innerHTML;
    };

    if (template === "cart") {
      const themeMessage = document.querySelector(".theme-message");

      if (cartEmpty) {
        if (!themeMessage) location.reload();
        return;
      }

      if (themeMessage) return location.reload();

      setInnerHTML(
        document.querySelector(".store-totals__content"),
        fetchedCart.querySelector(".store-totals__content"),
      );
      setInnerHTML(
        document.querySelector(".cart-area__content .row"),
        fetchedCart.querySelector(".sidebar-body__content"),
      );

      document
        .querySelectorAll(".store-product:not(.col-md-6)")
        .forEach((product) => product.classList.add("col-md-6"));

      cart.setupEventHandlers();
    } else {
      document.querySelector("cart-area").replaceWith(fetchedCart);

      const cartCount = dom.querySelector(".theme-cart-counter").innerHTML;
      updateHeaderCartCounter(cartCount);

      setInnerHTML(
        document.querySelector(".mobile-nav__total"),
        fetchedCart.querySelector(".store-totals__price--last"),
      );
    }
  } catch (error) {
    console.error(error);
  } finally {
    cart.setIsLoading(false);
  }
}

function addToCartProductBlock(target) {
  const block = $(target).closest(".product-block");
  const input = block.find("form .product-block__quantity input");
  if (block.length !== 1 || input.length !== 1) return;
  const id = +block.attr("data-product-id");
  const name = block.find(".product-block__name").text();
  const qty = +input.val() || 1;
  addToCart(id, name, qty, {});
}

/* ----- Handle Inputs ----- */
function checkQuantityProductBlock(target) {
  const input = $(target);
  const value = parseInt(input.val(), 10);
  const minimum = parseInt(input.attr("min"), 10) || 1;
  const maximum = parseInt(input.attr("max"), 10) || Infinity;
  const clampedValue = Math.max(minimum, Math.min(value, maximum));
  if (clampedValue !== value) input.val(clampedValue);
}

function changeQuantityProductBlock(target, delta) {
  const block = $(target).closest(".product-block");
  const input = block.find("form .product-block__quantity input");
  if (block.length !== 1 || input.length !== 1) return;
  const value = +input.val();
  const minimum = input.is("[min]") ? +input.attr("min") : 1;
  const maximum = input.is("[max]") ? +input.attr("max") : Infinity;
  const newValue = Math.max(minimum, Math.min(value + delta, maximum));
  input.val(newValue);

  const minusButton = block.find(".product-block__handler.quantity-down");
  const plusButton = block.find(".product-block__handler.quantity-up");

  minusButton.prop("disabled", newValue <= minimum);
  plusButton.prop("disabled", newValue >= maximum);
}

function checkBuyNowProductBlock(target) {
  const block = $(target).closest(".product-block");
  const input = block.find("form .product-block__quantity input");
  if (block.length !== 1 || input.length !== 1) return;

  const price = +input.attr("data-price");
  const minQuantity = +input.attr("min") || 1;
  const value = +input.val();
  const canBuy = canBuyNow({
    quantity: value,
    minQuantity: minQuantity,
    price: price,
  });

  const buyNowButton = block.find(".product-block__buy-now");
  buyNowButton.prop("disabled", !canBuy);
  buyNowButton.text(canBuy ? I18N.buy_now : I18N.buy_now_not_allowed);
}

function updateProductFormCounter(target, delta) {
  const productForm = $(target).closest(".product-form");
  const quantityInput = productForm.find("input#input-qty");
  if (productForm.length !== 1 || quantityInput.length !== 1) return;

  const price = document.querySelector("product-price").price;
  const value = +quantityInput.val();
  const minimum = quantityInput.is("[min]") ? +quantityInput.attr("min") : 1;
  const maximum = quantityInput.is("[max]") ? +quantityInput.attr("max") : Infinity;
  const newValue = Math.max(minimum, Math.min(value + delta, maximum));
  quantityInput.val(newValue);
  quantityInput.trigger("change");

  const minusButton = productForm.find(".product-form__handler.quantity-down");
  const plusButton = productForm.find(".product-form__handler.quantity-up");

  minusButton.prop("disabled", newValue <= minimum);
  plusButton.prop("disabled", newValue >= maximum);

  const $buyNowButton = $("#buy-now-button");
  if ($buyNowButton) {
    const canBuy = canBuyNow({
      quantity: newValue,
      minQuantity: minimum,
      price: price,
    });
    $buyNowButton.prop("disabled", !canBuy);
    $buyNowButton.text(canBuy ? I18N.buy_now : I18N.buy_now_not_allowed);
  }
}

function addToWishlist(target, url) {
  event.preventDefault();
  Jumpseller.addProductToWishlist(url, {
    callback: function (data) {
      if ((data.status && data.status === "rejected") || data.warning) {
        new ToastNotification({
          type: "error",
          title: I18N.error_adding_to_wishlist,
          message: data.message,
        });
        return;
      }
      const element = $(target).closest(".product-wishlist").get(0);
      element.updateIcon(true);
      if (element.variants) {
        const variant = element.variants.find((x) => x.variant_id === data.product.variant_id);
        variant.wishlisted = true;
      } else {
        element.product.wishlisted = true;
      }

      const prevProductsCount = $(".header__wishlist--counter").text();
      $(".header__wishlist--counter").text(parseInt(prevProductsCount) + 1);

      const wishlistLink = "/customer/?target=wishlist";
      const productNameBold = `<strong>${data.product.name}</strong>`;
      new ToastNotification({
        type: "success",
        title: I18N.success_adding_to_wishlist,
        message: `<span class="d-block">${formatTranslation(I18N.added_to_wishlist, { name: productNameBold })}</span>
         <a href="${wishlistLink}" class="toast-notification__link">${I18N.see_my_wishlist}</a>`,
      });
    },
  });
}

function removeFromWishlistCustomer(target, url) {
  event.preventDefault();
  Jumpseller.removeProductFromWishlist(url, {
    callback: function (data) {
      if (data.status && data.status != 200) {
        return;
      }
      location.reload();
    },
  });
}

function removeFromWishlist(target, url) {
  event.preventDefault();
  Jumpseller.removeProductFromWishlist(url, {
    callback: function (data) {
      if ((data.status && data.status === "rejected") || data.warning) {
        new ToastNotification({
          type: "error",
          title: I18N.error_removing_from_wishlist,
          message: data.message,
        });
        return;
      }
      const element = $(target).closest(".product-wishlist").get(0);
      element.updateIcon(false);

      if (element.variants) {
        const variant_element = element.variants.find((variant) => variant.variant_id === data.product.variant_id);
        variant_element.wishlisted = false;
      } else {
        element.product.wishlisted = false;
      }

      const prevProductsCount = $(".header__wishlist--counter").text();
      $(".header__wishlist--counter").text(parseInt(prevProductsCount) - 1);

      const wishlistLink = "/customer/?target=wishlist";
      const productNameBold = `<strong>${data.product.name}</strong>`;
      new ToastNotification({
        type: "success",
        title: I18N.success_removing_from_wishlist,
        message: `<span class="d-block">${formatTranslation(I18N.removed_from_wishlist, { name: productNameBold })}</span>
         <a href="${wishlistLink}" class="toast-notification__link">${I18N.see_my_wishlist}</a>`,
      });
    },
  });
}

function checkMaxQuantityReached(firstCall = false) {
  const $inputQty = $("input#input-qty");
  const quantitySelected = +$inputQty.val();
  const maxQuantity = +$inputQty.attr("max");
  const $maxStockDisclaimer = $(".product-form__text--max-stock-disclaimer");

  if (quantitySelected >= maxQuantity) {
    if (!firstCall) $maxStockDisclaimer.removeClass("hidden");
    $inputQty.val(maxQuantity);
  } else {
    $maxStockDisclaimer.addClass("hidden");
  }

  const productForm = document.querySelector("product-form.product-form");
  if (!productForm) return;

  if (quantitySelected === 0 || productForm.getIsOutOfStock()) $maxStockDisclaimer.addClass("hidden");
}

function addQuantityVerifyListener() {
  document
    .querySelectorAll(".product-form__handler.quantity-up, .product-form__handler.quantity-down")
    .forEach((qty) => qty.addEventListener("click", checkMaxQuantityReached));
}

function addVariantIdToUrl(variantId) {
  if (!variantId) return;
  const url = new URL(window.location.href);
  url.searchParams.set("variant_id", variantId);
  window.history.replaceState({}, "", url);
}

function getVariantIdFromUrl() {
  const url = new URL(window.location.href);
  return +url.searchParams.get("variant_id");
}

const productFormListeners = new Set();

/**
 * @description Add a dynamic variant listener to a product form.
 * The product json should be placed in a script.product-json element inside the root.
 * First section of this function declares a sequence of local functions that are used to rebuild the product html upon variant change.
 * @param {String} root the root unique selector of the product form.
 * @param {Boolean} isSelectedProduct whether the listener is for a selected product, false by default
 * @param {Number} firstVariant the first variant to select, null by default
 */
function dynamicProductFormListener(root, isSelectedProduct = false, firstVariant = null) {
  let firstCallbackForProduct = true;
  let firstCallbackForVariant = true;
  const variantSelectors = `${root} select.prod-options, ${root} fieldset.product-options__fieldset`;

  const rebuildAttributesComponent = (productInfo) => {
    const productAttributes = document.querySelector(`${root} product-attributes`);
    if (productAttributes) productAttributes.buildProductAttributes(productInfo);
  };

  const rebuildPriceComponent = (productInfoId) => {
    const productPrice = document.querySelector(`${root} product-price`);
    if (productPrice) productPrice.buildProductPrice(productInfoId);
  };

  const rebuildStockComponent = (productInfo) => {
    const productStock = document.querySelector(`${root} product-stock`);
    if (productStock) productStock.buildStock(productInfo);
  };

  const rebuildProductFormComponent = (productInfo) => {
    const productForm = document.querySelector(`${root} product-form`);
    if (productForm) productForm.buildProductForm(productInfo);
  };

  const rebuildPriceVolumesComponent = (productInfoId) => {
    const productVolumePrices = document.querySelector(`${root} product-volume-prices`);
    if (productVolumePrices) productVolumePrices.buildProductPriceVolumes(productInfoId);
  };

  const rebuildStockLocationsComponent = (variantId) => {
    const productStockLocations = document.querySelector(`${root} product-stock-locations`);
    if (productStockLocations) productStockLocations.buildStockLocations(variantId);
  };

  const rebuildWishlistComponent = (productInfo) => {
    const productWishlist = document.querySelector(`${root} product-wishlist`);
    if (productWishlist) productWishlist.buildWishlist(productInfo);
  };

  const getminimumToBuy = () => {
    const formJson = document.querySelector(`${root} script.product-form-json`);
    if (!formJson) return 1;

    try {
      const parsedFormJson = JSON.parse(formJson.textContent);
      const minimumQuantity = parsedFormJson.info.product.minimum_quantity;
      return minimumQuantity > 0 ? minimumQuantity : 1;
    } catch (error) {
      console.error("Failed to parse minimum quantity from product-form-json", error);
      return 1;
    }
  };

  const minimumToBuy = getminimumToBuy();

  const updateGalleryImage = (imageId, imageUrl) => {
    const gallery = document.querySelector(`${root} .product-gallery__carousel--main`);
    if (!gallery) return;

    if (imageId === null && imageUrl === null) {
      gallery.swiper.slideTo(0);
      return;
    }

    let index = -1;
    if (imageId !== null) {
      const matchById = $(`.swiper-slide img[src*="image/${imageId}/"]`, gallery);
      if (matchById.length > 0) index = matchById.first().closest(".swiper-slide").index();
    }

    if (index === -1 && imageUrl !== null) {
      const matchByUrl = $(`.swiper-slide img[src="${imageUrl}"]`, gallery);
      if (matchByUrl.length > 0) index = matchByUrl.first().closest(".swiper-slide").index();
    }

    gallery.swiper.slideTo(index >= 0 ? index : 0);
  };

  const setSelectedVariant = (values) => {
    for (const { value } of values) {
      $(`${root} .variants [value="${value.id}"]`).each(function () {
        $(this).is("input")
          ? $(this).prop("checked", true).trigger("change")
          : $(this).prop("selected", true).trigger("change");
      });
    }
  };

  const selectVariantFromUrlOrFirstOptionInStock = () => {
    if (!Array.isArray(productOrVariants)) return;

    const listener = [...productFormListeners].find((x) => x.selector === root);
    if (listener && !listener.isSelectedProduct) {
      const variantId = getVariantIdFromUrl();
      if (variantId > 0) {
        const variantMatch = productOrVariants.find((p) => p.variant.id == variantId);
        if (variantMatch) return setSelectedVariant(variantMatch.values);
      }
    }

    if (firstVariant > 0) return setSelectedVariant(productOrVariants.find((p) => p.variant.id == firstVariant).values);

    for (const item of productOrVariants) {
      const variant = item.variant;
      if (variant.stock_unlimited || variant.stock >= minimumToBuy) return setSelectedVariant(item.values);
    }
  };

  const updateCustomFields = (customFields) => {
    $(`${root} .product-details__row--variant-only`).addClass("hidden"); // Hide all variant-specific CFVs
    Object.values(customFields || []).forEach((cfv) => {
      $(`${root} .product-details__row--variant-only:has(.product-details__value[data-cfvid=${cfv.id}])`).removeClass(
        "hidden",
      ); // Show all variant-specific CFVs for this variant
    });
  };

  const updateVariantsAvailability = (productInfo) => {
    const $variants = $(`${root} .variants`).find("option, input, button:has(input)");
    $variants.addClass("disabled");

    const getValueIds = (product) => product.values.map((v) => v.value.id);
    const isInStock = ({ stock, stock_unlimited }) => stock_unlimited || stock >= minimumToBuy;

    const selectedProductOrVariants = productOrVariants.find((item) => item.variant.id == productInfo.id);
    if (!selectedProductOrVariants) return;
    const selectedIds = getValueIds(selectedProductOrVariants);

    const inStockVariants = productOrVariants
      .filter((product) => isInStock(product.variant))
      .map((product) => getValueIds(product));

    const idsToEnable = inStockVariants.reduce((ids, variantIds) => {
      // 1st level always enabled
      ids.add(variantIds[0]);

      // following level enabled if previous selection matches
      for (let i = 1; i < variantIds.length; i++) {
        if (variantIds[i - 1] !== selectedIds[i - 1]) break;
        ids.add(variantIds[i]);
      }

      return ids;
    }, new Set());

    if (isInStock(productInfo)) idsToEnable.add(productInfo.id);

    idsToEnable.forEach((id) =>
      $variants
        .filter(`option[value="${id}"], input[value="${id}"], button:has(input[value="${id}"])`)
        .removeClass("disabled"),
    );
  };

  const checkUploads = () => {
    const uploads = $(`${root} product-option__file-upload`);
    const inputSizes = new Array(uploads.length).fill(0); // track sizes

    $(`${root} .variants input[type="file"]`).each(function (index) {
      $(this).change(function () {
        inputSizes[index] = this.files[0].size;
        const totalSize = inputSizes.reduce((a, b) => a + b, 0);
        const inputFilename = document.getElementById(this.id + "_filename");
        if (totalSize <= 10485760) inputFilename.value = this.files[0].name;
        else {
          new ToastNotification({
            type: "error",
            title: I18N.error,
            message: I18N.files_too_large,
          });
          inputSizes[index] = 0;
          this.value = "";
          inputFilename.value = "";
        }
      });
    });
  };

  const getProductData = (selector) => {
    const data = {};
    document.querySelectorAll(`${root} ${selector}`).forEach((element) => {
      const elementId = element.getAttribute("data-optionid");
      const isSelect = element.querySelector("input") !== null;
      data[elementId] = isSelect ? element.querySelector(":checked")?.value : element?.value;
    });

    return data;
  };

  const productJson = $(`${root} script.product-json`);
  if (productJson.length === 0) return;

  const productId = +productJson.attr("data-productid");
  const productOrVariants = JSON.parse(productJson.get(0).textContent);
  const listenerToRemove = [...productFormListeners].find((x) => x.selector === root);
  if (listenerToRemove) {
    console.info(`Removing existing listener for ${root}`);
    jQuery(variantSelectors).off("change");
    productFormListeners.delete(listenerToRemove);
  }

  productFormListeners.add({
    selector: root,
    productId,
    isSelectedProduct,
  });

  console.info(`Listening to product variant changes at ${root} (${productOrVariants.length} variants)`);

  $(`${root} button#add-to-cart[type=button]`).on("click", () => {
    const name = $(`${root} .product-page__title`).text();
    const qty = $(`${root} .product-form__input`).val() || 1;
    const mergedOptions = getProductData(":is(.prod-options, .prod-frequencies, .prod-appointments)");
    addToCart(productId, name, qty, mergedOptions);
  });

  const callbackFunction = (_event, productInfo) => {
    if ($.isEmptyObject(productInfo)) return; // no variants for this product

    const dontAutoScrollToFirstImage = OPTIONS.pf_first_gallery_image && firstCallbackForProduct;
    if (window.lastVariantId !== productInfo.id) {
      window.lastVariantId = productInfo.id;
      firstCallbackForVariant = true;
    }

    const listener = [...productFormListeners].find((x) => x.selector === root);
    if (listener && !listener.isSelectedProduct) {
      addVariantIdToUrl(productInfo.id);
    }

    updateCustomFields(productInfo.custom_fields);
    updateVariantsAvailability(productInfo);
    updateGalleryImage(
      dontAutoScrollToFirstImage ? null : +productInfo.image_id,
      dontAutoScrollToFirstImage ? null : productInfo.image,
    );

    rebuildAttributesComponent(productInfo);
    rebuildPriceComponent(productInfo.id);
    rebuildStockComponent(productInfo);
    rebuildProductFormComponent(productInfo);
    rebuildPriceVolumesComponent(productInfo.id);
    rebuildStockLocationsComponent(productInfo.id);
    rebuildWishlistComponent(productInfo.id);

    addQuantityVerifyListener();
    checkMaxQuantityReached(firstCallbackForVariant);

    firstCallbackForProduct = false;
    firstCallbackForVariant = false;
  };

  Jumpseller.productVariantListener(variantSelectors, {
    product: productOrVariants,
    callback: callbackFunction,
  });

  selectVariantFromUrlOrFirstOptionInStock();
  addQuantityVerifyListener();
  checkMaxQuantityReached(true);
  checkUploads();
}

/* ----- Initialize Theme ----- */
if ($(".header-search, .header .jumpseller-autocomplete").length > 0) {
  $(".toggle-header-search").on("click", function () {
    const $search = $(".header-search");
    $search.toggleClass("header-search--visible");
    const input = $search.find("input[type='search']")[0];
    if (input && this.tagName === "BUTTON") {
      requestAnimationFrame(() => requestAnimationFrame(() => input.focus({ preventScroll: true })));
    }
  });
}

document.addEventListener("scroll", () => {
  const header = document.querySelector(".header");
  const overlapElement = document.querySelector('.header[data-overlap="true"]');
  const headerOverlay = document.querySelector(".header__overlay");

  if (!overlapElement || !header) return;

  const scrollY = window.scrollY;

  if (header.classList.contains("header--fixed")) {
    if (scrollY >= 50) {
      header.classList.remove("header--transparent");
    } else {
      header.classList.add("header--transparent");
    }
  }

  const startScroll = 30;
  const maxScroll = 100;
  const maxBlur = 5;

  if (scrollY > startScroll) {
    const adjustedScroll = scrollY - startScroll;
    const blurValue = Math.min((adjustedScroll / (maxScroll - startScroll)) * maxBlur, maxBlur);
    headerOverlay.style.backdropFilter = `blur(${blurValue}px)`;
  } else {
    headerOverlay.style.backdropFilter = "blur(0px)";
  }
});

function updateHeaderHeight() {
  const header = document.querySelector(".header");
  if (!header) return;

  const headerHeight = header.offsetHeight;
  const isMobile = $(window).width() < 768;

  document.documentElement.style.setProperty(`--header-height-${isMobile ? "mobile" : "desktop"}`, `${headerHeight}px`);
  document.documentElement.style.setProperty("--header-height", `${headerHeight}px`);

  // Adapt the top space for the sticky Product Gallery based on the Header height
  const $stickyProductGallery = $(".product-gallery__wrapper.sticky-md-top");
  if ($stickyProductGallery.length > 0) {
    $stickyProductGallery.each(function () {
      const parent = $(this).parents(".product-page");
      const topMargin = parent.css("--section-margin-top");
      const topPush = parseFloat(headerHeight) + 10;
      const topPushSlider = parseFloat(topMargin) + parseFloat(headerHeight) + 10;
      const isFixedHeader = $(".header").hasClass("header--fixed");
      const isPushHeader = $(".header").hasClass("header--push");
      if (isFixedHeader && isPushHeader) $(this).css("top", topPushSlider);
      else if (isFixedHeader) $(this).css("top", topPush);
    });
  }
}

const themeHeader = document.querySelector(".header");
if (themeHeader) {
  document.addEventListener("DOMContentLoaded", updateHeaderHeight);
  window.addEventListener("resize", updateHeaderHeight);

  const observer = new MutationObserver(updateHeaderHeight); // update header height whenever the content of the header changes
  observer.observe(themeHeader, { childList: true, subtree: true });
}

function adjustFlyoutSubmenusPosition() {
  // header flyout fix when submenus escape the viewport
  const adjustFlyoutPosition = ($itemSubmenu) => {
    const itemSubmenuOffset = $itemSubmenu.offset();
    const itemSubmenuWidth = $itemSubmenu.outerWidth();
    const windowWidth = $(window).width();

    // check if submenu goes off the screen on the right
    if (itemSubmenuOffset.left < 0 || itemSubmenuOffset.left + itemSubmenuWidth > windowWidth) {
      $itemSubmenu.attr("data-submenu-position", "force-right");
    }
  };

  // first level submenu > on click event
  $('.header-nav__anchor[data-event="click"]').on("click", function () {
    const $itemSubmenu = $(this).parent(".header-nav__item.dropdown").find(".header-flyout").first();
    if ($itemSubmenu.length > 0 && $(this).hasClass("show")) adjustFlyoutPosition($itemSubmenu);
  });

  // first level submenu > on hover event
  $('.header-nav__anchor[data-event="hover"]').on("mouseenter", function () {
    const $itemSubmenu = $(this).parent(".header-nav__item.dropdown").find(".header-flyout").first();
    if ($itemSubmenu.length > 0 && $(this).hasClass("show")) adjustFlyoutPosition($itemSubmenu);
  });

  // deeper levels > on click event
  $('.header-flyout__link--has-dropdown[data-event="click"]').on("click", function () {
    const $itemSubmenu = $(this).parent(".header-flyout__item").find(".header-flyout").first();
    if ($itemSubmenu.length > 0 && $(this).hasClass("show")) adjustFlyoutPosition($itemSubmenu);
  });

  // deeper levels > on hover event
  $('.header-flyout__link--has-dropdown[data-event="hover"]').on("mouseenter", function () {
    const $itemSubmenu = $(this).parent(".header-flyout__item").find(".header-flyout").first();
    if ($itemSubmenu.length > 0) adjustFlyoutPosition($itemSubmenu);
  });
}

function cycleProductBlockImagesOnHover() {
  $(".product-block__image--overlap").each(() => {
    const imageParent = $(this).parents(".product-block");
    const imageOriginal = $(this).attr("data-image-original");
    const imageHover = $(this).attr("data-image-hover");
    const imageSource = $(this).find("source");

    imageParent
      .on("mouseenter", () => imageSource.attr("srcset", imageHover))
      .on("mouseleave", () => imageSource.attr("srcset", imageOriginal));
  });
}

function handleProductVideoEmbed() {
  const videos = document.querySelectorAll("[data-youtube]");
  if (videos.length === 0) return;

  videos.forEach((video) => {
    try {
      const url = new URL(video.href);
      const id = url.searchParams.get("v");
      if (id) {
        video.setAttribute("data-youtube", id);
        video.setAttribute("role", "button");
        video.innerHTML = `<img src="https://img.youtube.com/vi/${id}/maxresdefault.jpg"><br>${video.textContent}`;
      }
    } catch (error) {
      console.error("Invalid video URL", error);
    }
  });

  document.addEventListener("click", (event) => {
    const link = event.target.closest("[data-youtube]");
    if (link) {
      event.preventDefault();
      const id = link.getAttribute("data-youtube");
      const player = document.createElement("div");
      player.innerHTML = `<iframe width="100%" height="auto" src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
      link.replaceWith(player);
    }
  });
}

function initializeProductPage() {
  const moveProductPageContentBetweenMobileAndDesktop = () => {
    if ($(".product-page .mobile-first").length === 0 || window.theme.template !== "product") return;

    const isMobile = $(window).width() < 768;
    const $productPage = $(".product-page");
    const $productInfo = $productPage.find(".product-page__info");
    const $productGalleryWrapper = $productPage.find(".product-gallery__wrapper");
    const $itemsToMove = $productPage.find(".product-page__info .mobile-first");

    if ($productPage.find(".product-heading").length === 0)
      $("<div>", { class: "product-heading" }).append($itemsToMove).appendTo($productPage);
    const $productHeading = $productPage.find(".product-heading");

    if (isMobile) $productHeading.insertBefore($productGalleryWrapper);
    else $productHeading.insertBefore($productInfo);
  };

  const productPageZoomLensOnImageHover = () => {
    $(".product-gallery").each(function () {
      const isMobile = $(window).width() < 768;
      const enableZoom = $(".product-gallery__wrapper", this).attr("data-zoom") === "true";
      if (enableZoom && !isMobile) {
        $(".product-gallery__zoom-icon", this).show();
      } else {
        $(".product-gallery__zoom-icon", this).hide();
      }
    });
  };

  const productPageGridZoomFollowMouse = () => {
    if ($(window).width() < 768) return;
    const selector = ".product-gallery__main--grid[data-zoom='true'] .product-gallery__picture";
    $(document)
      .off("mousemove.productGridZoom", selector)
      .on("mousemove.productGridZoom", selector, function (event) {
        if ($(window).width() < 768) return;
        const rect = this.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 100;
        const y = ((event.clientY - rect.top) / rect.height) * 100;
        $(this).find("img").css("transform-origin", `${x}% ${y}%`);
      });

    $(document)
      .off("mouseleave.productGridZoom", selector)
      .on("mouseleave.productGridZoom", selector, function () {
        $(this).find("img").css("transform-origin", "center center");
      });
  };

  const productPageDescriptionToggle = () => {
    if ($('.product-page__body[data-collapse="true"]').length === 0) return;
    $('.product-page__body[data-collapse="true"]').each(function () {
      const descriptionHeight = parseFloat($(this).height());
      const descriptionThreshold = parseFloat($(this).data("collapse-threshold"));
      const descriptionToggle = $(".product-page__toggle");
      if (descriptionHeight >= descriptionThreshold) {
        $(this).addClass("product-page__body--collapse");
        descriptionToggle.removeClass("hidden");
      } else {
        $(this).removeClass("product-page__body--collapse");
        descriptionToggle.addClass("hidden");
      }
      descriptionToggle.on("click", function () {
        $(this)
          .parents(".product-page__description")
          .find(".product-page__body")
          .toggleClass("product-page__body--collapse");
        $(this).toggleClass("active");
      });
    });
  };

  $('[id^="product-template-"]').each(function () {
    const productPageId = `#${$(this).attr("id")}`;
    dynamicProductFormListener(productPageId, false);
  });

  productPageZoomLensOnImageHover();
  productPageGridZoomFollowMouse();
  productPageDescriptionToggle();
  handleProductVideoEmbed();
  moveProductPageContentBetweenMobileAndDesktop();
  $(window).on("resize", moveProductPageContentBetweenMobileAndDesktop);
}

function initializeSelectedProduct() {
  $('[id*="selected-product-"]').each(function () {
    const selectedProductId = `#${$(this).attr("id")}`;
    dynamicProductFormListener(selectedProductId, true);
  });
}

function initializeProductBlockInputs() {
  document.querySelectorAll(".product-block__input").forEach((input) => {
    const price = +input.getAttribute("data-price");
    const minQuantity = +input.getAttribute("min");

    checkQuantityProductBlock(input);
    checkBuyNowProductBlock(input, price, minQuantity);
    input.addEventListener("change", function () {
      checkQuantityProductBlock(this);
      checkBuyNowProductBlock(this, price, minQuantity);
    });
  });
}

function applyClassNamesForStyling() {
  $("input.invalid").addClass("is-invalid");
  $("#contact_form .button").addClass("button--style button--main");
  $("#submit_login ").addClass("button--style button--secondary");
  $("<a>", {
    href: I18N.customer_register_back_link_url,
    title: I18N.customer_register_back_link_text,
    text: I18N.customer_register_back_link_text,
  }).appendTo(".customer-form:not(.customer-form--details) #details .actions");
  $(".customer-form form .actions .button").addClass("button--style button--main");
  $(".customer-form form div.error").addClass("alert alert-danger");
  $(".customer-form form div.notice").addClass("alert alert-primary");
  $(".customer-form form div.warning").addClass("alert alert-warning");

  $("figure iframe").parent("figure").addClass("video-wrapper");
  $(".theme-section__body table").addClass("table table-bordered theme-table");
  $(".theme-section__body table").each(function () {
    $(this).wrap('<div class="table-responsive"></div>');
  });

  $(".cart-page #credentials").find("#submit_password").addClass("button--style button--secondary");
  $("input#estimate_shipping_postal").addClass("text");
  $("#estimate_shipping_button").addClass("w-100");
  $("#estimate_shipping_button, #set_shipping_button").addClass("button button--style button--secondary button--small");
  const estimateResultsForm = $("#estimate_shipping_results");
  if (estimateResultsForm.is(":visible")) {
    $("#estimate_shipping_button").parents(".estimate_shipping_buttons").hide();
    $("#estimate_shipping_form .select").on("change", function () {
      estimateResultsForm.hide();
      $("#estimate_shipping_button").parents(".estimate_shipping_buttons").show();
    });
  }
}

function filtersDirectClick() {
  const form = document.getElementById("filters-form");

  if (!form || form.dataset.behavior !== "true") return;

  form.addEventListener("click", function (event) {
    if (window.innerWidth > 767) {
      const target = event.target;
      if (target.classList.contains("theme-filters__checkbox")) {
        form.submit();
      }
    }
  });
}
document.addEventListener("DOMContentLoaded", filtersDirectClick);

function filtersCountOnButton() {
  const filtersButton = $('.theme-section__heading .button[data-bs-target="#sidebar-filters"]');
  const filtersButtonLength = filtersButton.length;
  const filtersCount = $(".theme-filters__group > .theme-filters__tag:not(.theme-filters__tag--remove)").length;

  if (filtersButtonLength > 0 && filtersCount > 0) {
    filtersButton.append(" <span>(" + filtersCount + ")</span>");
  }
}

function applyProseStyles(rootSelector) {
  const $root = $(rootSelector);
  if ($root.length === 0) return;

  document.querySelectorAll("table").forEach((table) => table.classList.add("table", "table-bordered", "theme-table"));
  document.querySelectorAll("li").forEach((li) => {
    // redactor to do list support
    const content = li.innerHTML.trim();
    if (content.startsWith("[x]") || content.startsWith("[]") || content.startsWith("[ ]")) {
      const isChecked = content.startsWith("[x]");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = isChecked;
      checkbox.disabled = true;
      checkbox.classList.add("me-2", "mt-1");
      li.innerHTML = content.substring(3).trim();
      li.insertBefore(checkbox, li.firstChild);
      li.classList.add("list-unstyled", "d-flex", "align-items-start");
      li.parentElement.classList.add("ps-0");
    }
  });
}

function setupStoreProductAddToCartButtons() {
  const buttons = document.querySelectorAll(".store-product__add-to-cart[type='button']");
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const { productId, productName } = button.dataset;
      const actionUrl = button.closest(".store-product__form").getAttribute("action");
      const urlParams = new URLSearchParams(actionUrl.split("?")[1]);
      const qty = urlParams.get("qty") || 1;
      const options = {};
      urlParams.forEach((value, key) => {
        if (key !== "qty") options[key] = value;
      });

      addToCart(productId, productName, qty, options, "store-product", { id: productId });
    });
  });
}

function closeQuickView() {
  const productQuickView = document.getElementById("product-quick-view");
  if (!productQuickView) return;

  const displayMode = productQuickView.dataset.display || "offcanvas";
  if (displayMode === "modal") {
    const modalInstance = bootstrap.Modal.getInstance(productQuickView) || new bootstrap.Modal(productQuickView);
    if (modalInstance && typeof modalInstance.hide === "function") modalInstance.hide();
    return;
  }

  const offcanvasInstance =
    bootstrap.Offcanvas.getInstance(productQuickView) || new bootstrap.Offcanvas(productQuickView);
  if (offcanvasInstance && typeof offcanvasInstance.hide === "function") offcanvasInstance.hide();
}

/* ------------ Custom Elements ------------ */
class CustomHTMLElement extends HTMLElement {
  constructor() {
    super();
    this.initialized = false;
  }

  connectedCallback() {
    if (this.initialized) return;
    this.initialize();
    this.initialized = true;
  }

  initialize() {}
}

class QuickView extends CustomHTMLElement {
  constructor() {
    super();
  }

  initialize() {
    const button = this.querySelector(".product-block__quick-view, .product-mapping__marker--quick-view");
    button.addEventListener("click", this.buildQuickView);
  }

  disconnectedCallback() {
    const button = this.querySelector(".product-block__quick-view, .product-mapping__marker--quick-view");
    button.removeEventListener("click", this.buildQuickView);
  }

  async buildQuickView(event) {
    const button = event.currentTarget;

    const productId = button.dataset.productId;
    const productName = button.dataset.productName;
    const productUrl = button.dataset.productUrl;
    const quickViewUrl = button.dataset.quickViewUrl;

    const productQuickView = document.getElementById("product-quick-view");
    productQuickView.setAttribute("aria-labelledby", `product-title-${productId}`);
    const quickViewBody = productQuickView.querySelector(".product-quick-view__container");
    quickViewBody.className = `product-quick-view__container product-quick-view-${productId}`;
    quickViewBody.innerHTML = "<div class='loading-spinner__wrapper'><div class='loading-spinner'></div></div>";

    const productQuickViewMarkerObject = button.closest("quick-view");
    if (productQuickViewMarkerObject) {
      productQuickViewMarkerObject.classList.add("active");
    }

    const productQuickViewType = productQuickView.classList.contains("offcanvas")
      ? "hidden.bs.offcanvas"
      : "hidden.bs.modal";

    productQuickView.addEventListener(productQuickViewType, () => {
      if (productQuickViewMarkerObject) {
        productQuickViewMarkerObject.classList.remove("active");
      }

      const productQuickViewMarker = document.querySelector(
        `.product-mapping__marker--quick-view[data-product-id="${productId}"]`,
      );

      if (productQuickViewMarker) {
        const productQuickViewMarkerParent = productQuickViewMarker.closest("quick-view");
        if (productQuickViewMarkerParent) {
          productQuickViewMarkerParent.classList.remove("active");
        }
      }
    });

    const productHtml = await localizedFetch(quickViewUrl).then((response) => response.text());
    quickViewBody.innerHTML = "";
    const offcanvasHeaderLink = productQuickView.querySelector(".product-quick-view__header a");
    if (offcanvasHeaderLink) {
      offcanvasHeaderLink.setAttribute("href", productUrl);
      offcanvasHeaderLink.setAttribute("title", `${I18N.go_to} ${productName}`);
    }

    const productTemplate = document.createElement("div");
    productTemplate.innerHTML = productHtml;

    const productJson = productTemplate.querySelector("script.product-json");
    if (productJson) quickViewBody.appendChild(productJson);

    const productGallery = productTemplate.querySelector(".product-gallery__wrapper");
    const galleryMain = productTemplate.querySelector(".product-gallery__carousel--main");
    const galleryThumbs = productTemplate.querySelector(".product-gallery__carousel--thumbs");
    if (galleryThumbs && galleryMain) {
      galleryThumbs.querySelectorAll(".product-gallery__arrow").forEach((arrow) => galleryMain.appendChild(arrow));
      galleryThumbs.remove();
    }

    const quickViewDetailsWrapper = document.createElement("div");
    quickViewDetailsWrapper.classList.add("product-quick-view__details-wrapper");
    let hasDetailsContent = false;
    const appendToDetails = (element) => {
      if (!element) return;
      hasDetailsContent = true;
      quickViewDetailsWrapper.appendChild(element);
    };

    if (productGallery) {
      // Quick view should always render the gallery as a carousel
      productGallery.dataset.type = "carousel";
      const gallerySwiper = productGallery.querySelector("swiper-slider");
      if (gallerySwiper) gallerySwiper.dataset.type = "carousel";

      const galleryMainCarousel = productGallery.querySelector(".product-gallery__carousel--main");
      if (galleryMainCarousel) {
        galleryMainCarousel.dataset.type = "carousel";
        galleryMainCarousel.classList.remove("product-gallery__main--grid");
      }

      productGallery.setAttribute("data-zoom", "false");
      productGallery.classList.remove("sticky-md-top");
      productGallery.style.removeProperty("top");
      productGallery.querySelectorAll(".product-gallery__zoom-icon").forEach((zoomIcon) => zoomIcon.remove());
      quickViewBody.appendChild(productGallery);
    }

    appendToDetails(productTemplate.querySelector("product-attributes"));

    const productTitle = productTemplate.querySelector("[data-name='product-title']");
    if (productTitle) {
      const h1Element = productTitle.querySelector("h1");
      if (h1Element) {
        const divTitle = document.createElement("div");
        divTitle.classList = h1Element.classList;
        divTitle.innerHTML = h1Element.innerHTML;
        divTitle.id = `product-title-${productId}`;
        productTitle.replaceChild(divTitle, h1Element);
      }
      appendToDetails(productTitle);
    }

    appendToDetails(productTemplate.querySelector("product-price"));
    appendToDetails(productTemplate.querySelector("product-stock"));

    const productForm = productTemplate.querySelector("product-form");
    if (productForm) {
      const productFormWrapper = productForm.querySelector(".product-form__wrapper");
      if (productFormWrapper) productFormWrapper.style.flexWrap = "wrap";
      const productFormQuantity = productForm.querySelector(".product-form__quantity");
      if (productFormQuantity) productFormQuantity.style.flex = "1";
      const productFormAddToCart = productForm.querySelector("#add-to-cart");
      if (productFormAddToCart) productFormAddToCart.style.flex = "2";
      const productFormBuyNow = productForm.querySelector("#buy-now-button");
      if (productFormBuyNow) productFormBuyNow.style.width = "100%";
      appendToDetails(productForm);
    }

    appendToDetails(productTemplate.querySelector(".product-wishlist"));
    appendToDetails(productTemplate.querySelector(".product-page__description"));

    if (hasDetailsContent) quickViewBody.appendChild(quickViewDetailsWrapper);

    const productTooltips = productQuickView.querySelectorAll('[data-bs-toggle="tooltip"]');
    [...productTooltips].map((x) => new bootstrap.Tooltip(x));

    const addToCartButton = productQuickView.querySelector("#add-to-cart[type='button']");
    if (addToCartButton) addToCartButton.addEventListener("click", () => closeQuickView());

    dynamicProductFormListener(`.product-quick-view-${productId}`, true);
  }
}
window.customElements.define("quick-view", QuickView);

class ShareComponent extends CustomHTMLElement {
  constructor() {
    super();
  }

  initialize() {
    this.buildShare();
  }

  disconnectedCallback() {
    if (!this.shareButton) return;
    this.shareButton.off("click");
  }

  buildShare() {
    const data = JSON.parse(this.querySelector(`script.share-json`).textContent);
    const options = data.options;
    this.item = data.info.product || data.info.page;
    const isProduct = !!data.info.product;

    let sharingHtml = "";
    if (options.showFacebook) sharingHtml += this.#getShareHTML(this.item, "facebook");
    if (options.showTwitter) sharingHtml += this.#getShareHTML(this.item, "twitter");
    if (options.showWhatsapp) sharingHtml += this.#getShareHTML(this.item, "whatsapp");
    if (options.showPinterest) sharingHtml += this.#getShareHTML(this.item, "pinterest", isProduct);
    if (options.showEmail) sharingHtml += this.#getShareHTML(this.item, "email");
    if (options.showClipboard) sharingHtml += this.#getShareHTML(this.item, "clipboard");
    sharingHtml += this.#getGeneralShareHTML(this.item, data.info.title);

    $(".theme-share", this).html(sharingHtml);
    this.handleNativeShare(isProduct ? null : data.info.sectionId);
  }

  handleNativeShare(sectionId) {
    const topmost = sectionId ? $(`#${sectionId}`) : $(this);
    const shareTitle = topmost.find(".theme-section__title, .product-page__subtitle");
    const shareLink = topmost.find(".theme-share__link");
    this.shareButton = topmost.find(".theme-share__button");

    if (navigator.share && window.innerWidth < 768) {
      shareTitle.addClass("hidden");
      shareLink.addClass("hidden");
      this.shareButton.removeClass("hidden");

      this.shareButton.on("click", this.#handleClick);
    } else {
      shareTitle.removeClass("hidden");
      shareLink.removeClass("hidden");
      this.shareButton.addClass("hidden");
    }
  }

  #handleClick = () => {
    navigator
      .share({
        title: this.item.name || this.item.title,
        url: this.item.url,
      })
      .then(() => {
        console.info(`${this.item.name || this.item.title} successfully shared.`);
      })
      .catch(console.error);
  };

  #getShareHTML(item, platform, isProduct = true) {
    const shareConfigs = {
      facebook: {
        url: `https://www.facebook.com/share.php?u=${encodeURIComponent(item.url)}&title=${encodeURIComponent(item.name || item.title)}`,
        icon: "ph-facebook-logo",
        title: "Facebook",
        action: "popup",
      },
      twitter: {
        url: `https://twitter.com/intent/tweet?url=${encodeURIComponent(item.url)}&text=${encodeURIComponent(item.name || item.title)}`,
        icon: "ph-x-logo",
        title: "𝕏",
        action: "popup",
      },
      whatsapp: {
        url: `https://api.whatsapp.com/send?text=${I18N.check_this}%20${encodeURIComponent(item.name || item.title)}%20${encodeURIComponent(item.url)}`,
        icon: "ph-whatsapp-logo",
        title: "WhatsApp",
        action: "popup",
      },
      pinterest: {
        url: this.#getPinterestUrl(item, isProduct),
        icon: "ph-pinterest-logo",
        title: "Pinterest",
        action: "popup",
      },
      email: {
        url: `mailto:?subject=${encodeURIComponent(item.name || item.title)}&body=${encodeURIComponent(item.url)}`,
        icon: "ph-envelope-simple",
        title: "Email",
        action: "direct",
      },
      clipboard: {
        url: item.url,
        icon: "ph-link",
        title: I18N.copy_to_clipboard,
        action: "clipboard",
      },
    };

    const config = shareConfigs[platform];
    const url = config.url.replace(/'/g, "\\'");

    let onClickAction;
    switch (config.action) {
      case "popup":
        onClickAction = `openUrlInPopup('${url}')`;
        break;
      case "direct":
        onClickAction = "";
        break;
      case "clipboard":
        onClickAction = `copyToClipboard('${url}', true)`;
        break;
      default:
        onClickAction = "";
    }

    return `<button
      type="button"
      ${onClickAction ? `onclick="${onClickAction}"` : ""}
      ${config.action === "direct" ? `href="${url}"` : ""}
      title="${config.action === "clipboard" ? config.title : `${I18N.share_on} ${config.title}`}"
      class="button theme-share__link"
    >
      <i class="theme-icon ph ${config.icon}"></i>
    </button>`;
  }

  #getPinterestUrl(item, isProduct) {
    const getDescription = (text) => (text ? text.replace(/'/g, "") : "");
    const description = isProduct
      ? [getDescription(item.name), getDescription(item.description)]
      : [getDescription(item.title), getDescription(item.body)];

    const descriptionText = description.filter(Boolean).join(" - ");
    const imageContent = item.image ? `media=${encodeURIComponent(item.image)}&` : "";
    return `https://pinterest.com/pin/create/bookmarklet/?${imageContent}url=${encodeURIComponent(item.url || "")}&is_video=false&description=${encodeURIComponent(descriptionText)}`;
  }

  #getGeneralShareHTML(item, title) {
    return `<button
      type="button"
      class="button button--style button--secondary button--bordered theme-share__button"
    >
      <i class="theme-icon ph ph-share-network"></i>
      <span>${title}</span>
    </button>`;
  }
}
window.customElements.define("share-component", ShareComponent);

class NewsletterForm extends CustomHTMLElement {
  constructor() {
    super();
  }

  initialize() {
    this.success = this.getAttribute("fn-success") || I18N.newsletter_message_success;
    this.failure = this.getAttribute("fn-failure") || I18N.newsletter_message_error;
    this.placeholder = this.getAttribute("fn-email-placeholder") || I18N.newsletter_text_placeholder;
    this.buttonText = this.getAttribute("fn-button-text") || I18N.newsletter_text_button;
    this.buttonClass = this.getAttribute("fn-button-class");
    const form = $(this).find("form");
    if (form.length > 0) {
      this.#extendBaseForm(form);
      form.get(0).addEventListener("jumpseller-captcha-validated", this.#onCaptchaValidated);
      form.prop("role", null);
    }
  }

  disconnectedCallback() {
    const form = $(this).find("form").get(0);
    form.removeEventListener("jumpseller-captcha-validated", this.#onCaptchaValidated);
  }

  #extendBaseForm(form) {
    $(this).is(".footer-newsletter") ? this.#extendFooterForm(form) : this.#extendComponentForm(form);
  }

  #extendFooterForm(form) {
    form.addClass("validate footer-newsletter__form");
    form.find(".newsletter_form_group").addClass("footer-newsletter__field");
    form
      .find("input[name='customer[email]']")
      .addClass("email footer-newsletter__input")
      .attr("placeholder", this.placeholder);
    form
      .find("button")
      .addClass("button button--main footer-newsletter__submit")
      .html('<i class="ph ph-paper-plane-right"></i>')
      .attr("aria-label", this.buttonText);
  }

  #extendComponentForm(form) {
    form.addClass("validate");
    form.find(".newsletter_form_group").addClass("theme-newsletter__wrapper");
    form.find("input[name='customer[email]']").addClass("email field text theme-newsletter__input");
    form.find("input[name='customer[email]']").attr("placeholder", this.placeholder);
    form.find("button").addClass(this.buttonClass).html(this.buttonText);
  }

  #onCaptchaValidated = (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    $.ajax({ method: "POST", url: form.action, data: formData, processData: false, contentType: false })
      .done(
        () =>
          new ToastNotification({
            type: "success",
            title: I18N.newsletter_message_success_captcha,
            message: this.success,
          }),
      )
      .fail(
        () =>
          new ToastNotification({
            type: "error",
            title: I18N.newsletter_message_error_captcha,
            message: this.failure,
          }),
      );
  };
}
window.customElements.define("newsletter-form", NewsletterForm);

class InstagramFeed extends CustomHTMLElement {
  constructor() {
    super();
  }

  initialize() {
    this.#loadInstagramPosts();
  }

  #loadInstagramPosts() {
    const limitAttr = Number(this.getAttribute("ig-limit"));
    const limit = Number.isFinite(limitAttr) && limitAttr > 0 ? limitAttr : 6;
    const xhr = new XMLHttpRequest();
    const container = this;
    xhr.open("GET", `/instagram-app/media?count=${limit}`, true);
    xhr.onreadystatechange = function () {
      if (this.readyState !== XMLHttpRequest.DONE || this.status !== 200) return;

      let json;
      try {
        json = JSON.parse(xhr.responseText);
      } catch (e) {
        console.warn("Instagram feed response is not valid JSON. Nothing to render", e);
        return;
      }

      const posts = Array.isArray(json?.posts) ? json.posts : [];
      if (posts.length === 0) return;

      posts.slice(0, limit).forEach((post) => {
        const postClass = container.getAttribute("ig-class");
        const postColumns = container.getAttribute("ig-limit");
        const postSpacing = container.getAttribute("ig-spacing");
        const postTitle = container.getAttribute("ig-title");
        const postBlockImg = document.createElement("img");
        postBlockImg.className = "instagram-block__image";
        postBlockImg.src = post.thumbnail_url;
        postBlockImg.alt = post.caption?.substring(0, 80) || "";
        postBlockImg.loading = "lazy";

        postBlockImg.onerror = () => {
          const placeholder = document.createElement("div");
          placeholder.className = "theme-image-placeholder theme-image-placeholder--instagram";
          if (postBlockImg.parentNode) {
            postBlockImg.parentNode.replaceChild(placeholder, postBlockImg);
          }
        };

        const postBlockIcon = document.createElement("i");
        postBlockIcon.className = "ph ph-instagram-logo";
        const postBlockText = document.createElement("div");
        postBlockText.innerText = `${postTitle}`;
        const postBlockOverlay = document.createElement("div");
        postBlockOverlay.className = "instagram-block__overlay trsn";
        postBlockOverlay.appendChild(postBlockIcon);
        postBlockOverlay.appendChild(postBlockText);
        const postBlockAnchor = document.createElement("a");
        postBlockAnchor.target = "_blank";
        postBlockAnchor.href = post.permalink;
        postBlockAnchor.title = postTitle;
        postBlockAnchor.className = "instagram-block__anchor";
        postBlockAnchor.appendChild(postBlockImg);
        postBlockAnchor.appendChild(postBlockOverlay);
        const postBlock = document.createElement("div");
        postBlock.className = `theme-block instagram-block ${postClass}`;
        postBlock.setAttribute("data-columns", postColumns);
        postBlock.setAttribute("data-spacing", postSpacing);
        postBlock.appendChild(postBlockAnchor);
        container.appendChild(postBlock);
      });
    };
    xhr.send();
  }
}
window.customElements.define("instagram-feed", InstagramFeed);

class PopupAgeVerification extends CustomHTMLElement {
  constructor() {
    super();
    this.cookieName = "age-verification-verified";
    this.noRedirect = OPTIONS.av_popup_button_reject_redirect;
  }

  initialize() {
    this.#registerListeners();
    this.#verificationLoad();
  }

  disconnectedCallback() {
    this.#removeListeners();
  }

  #registerListeners() {
    this.querySelectorAll(".age-verification__button--accept").forEach((button) => {
      button.addEventListener("click", this.#confirm);
    });
    this.querySelectorAll(".age-verification__button--reject").forEach((button) => {
      button.addEventListener("click", this.#failed);
    });
  }

  #removeListeners() {
    this.querySelectorAll(".age-verification__button--accept").forEach((button) => {
      button.removeEventListener("click", this.#confirm);
    });
    this.querySelectorAll(".age-verification__button--reject").forEach((button) => {
      button.removeEventListener("click", this.#failed);
    });
  }

  #verificationLoad() {
    try {
      const agePass = this.#getCookie();
      agePass != "" ? this.#popupHide() : this.#popupShow();
    } catch (err) {
      this.#popupShow();
    }
  }

  #setCookie(cvalue, exdays) {
    const d = new Date();
    d.setTime(d.getTime() + exdays * 24 * 60 * 60 * 1000);
    const expires = "expires=" + d.toUTCString();
    document.cookie = `${this.cookieName}=${cvalue};${expires};path=/`;
  }

  #getCookie() {
    const name = `${this.cookieName}=`;
    const ca = document.cookie.split(";");
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === " ") c = c.substring(1);
      if (c.indexOf(name) === 0) return c.substring(name.length, c.length);
    }
    return "";
  }

  #popupHide = () => {
    document.body.style.overflow = "auto";
    this.style.display = "none";
  };

  #popupShow = () => {
    document.body.style.overflow = "hidden";
    this.style.display = "block";
  };

  #confirm = () => {
    this.#setCookie("pop-up-verified", 365);
    this.#popupHide();
  };

  #failed = () => {
    window.location.replace(this.noRedirect);
  };
}
window.customElements.define("popup-age-verification", PopupAgeVerification);

class StoreWhatsapp extends CustomHTMLElement {
  constructor() {
    super();
  }

  initialize() {
    this.#showWhatsappMessage();
    this.closeButton = $(".store-whatsapp__close", this);
    this.closeButton.on("click", this.#closeWhatsappMessage);
  }

  disconnectedCallback() {
    if (!this.closeButton) return;
    this.closeButton.off("click");
  }

  #showWhatsappMessage() {
    const days = +this.getAttribute("box-cookie");
    const whatsappMessage = document.querySelector(".store-whatsapp__message");
    if (!whatsappMessage) return;
    const closedAt = Number(localStorage.getItem("whatsappMessageClosedAt"));

    if (Number.isNaN(days)) {
      whatsappMessage.style.display = "none";
      return;
    }

    if (days === 0) {
      whatsappMessage.style.display = "";
      localStorage.removeItem("whatsappMessageClosedAt");
      return;
    }

    const now = Date.now();
    const closedTime = days * 24 * 60 * 60 * 1000;

    if (!closedAt || now - closedAt >= closedTime) {
      whatsappMessage.style.display = "";
      localStorage.removeItem("whatsappMessageClosedAt");
    } else {
      whatsappMessage.style.display = "none";
    }
  }

  #closeWhatsappMessage() {
    const days = +this.getAttribute("box-cookie");
    const whatsappMessage = document.querySelector(".store-whatsapp__message");

    if (whatsappMessage) {
      whatsappMessage.style.display = "none";

      if (days > 0) {
        localStorage.setItem("whatsappMessageClosedAt", new Date().getTime());
      }
    }
  }
}
window.customElements.define("store-whatsapp", StoreWhatsapp);

class SwiperSlider extends CustomHTMLElement {
  static indexCache = {};

  static rebuildContainer(container, selector, fragment, append = false) {
    const swiper = container.querySelector("swiper-slider");
    if (swiper) {
      swiper.rebuild(fragment, append);
    } else if (append) {
      container.querySelector(selector).append(fragment);
    } else {
      container.querySelector(selector).replaceChildren(fragment);
    }
  }

  constructor() {
    super();
    this.handleResize = this.#handleResize.bind(this);
    this.handleSubSectionSelect = this.#updateIndex.bind(this);
    this.handleSectionSelect = this.#updateAutoplay.bind(this);
    this.handleSectionDeselect = this.#updateAutoplay.bind(this);
  }

  connectedCallback() {
    this.initialize();
    this.root.querySelector(".loading-spinner__wrapper")?.remove();
  }

  initialize() {
    const rootSelector = this.getAttribute("sw-root") || "[id^=component-]";
    const frozen = new URLSearchParams(window.location.search).get("for_screenshot") === "1";
    this.root = this.closest(rootSelector) || this;
    this.section_id = this.closest("[id^=theme-section-]")?.id;
    this.layout = this.getAttribute("sw-layout");
    this.layoutType = this.getAttribute("sw-layout-type") || "multiple";
    this.columns = +this.getAttribute("sw-columns");
    this.columnsDesktop = +this.getAttribute("sw-columns-desktop") || this.columns || 1;
    this.columnsTablet = parseInt(this.getAttribute("sw-columns-tablet"), 10);
    this.columnsMobileUp = parseInt(this.getAttribute("sw-columns-mobile-up"), 10);
    this.columnsMobile = +this.getAttribute("sw-columns-mobile") || this.columns || 1;
    this.columnsMobileSmall = +this.getAttribute("sw-columns-mobile-small") || this.columns || 1;
    this.direction = this.getAttribute("sw-direction") || "horizontal";
    this.rewind = this.getAttribute("sw-rewind") !== "false";
    this.loop = this.getAttribute("sw-loop") === "true";
    this.freeMode = this.getAttribute("sw-free-mode") === "true";
    this.effect = this.getAttribute("sw-effect");
    this.observer = this.getAttribute("sw-observer") === "true";
    this.autoHeight = this.getAttribute("sw-auto-height") === "true";
    this.grab = this.getAttribute("sw-grab") === "true";
    this.autoplay = this.getAttribute("sw-autoplay") === "true" && !frozen;
    this.autoplayContinuous = this.getAttribute("sw-continuous") === "true";
    this.speed = +this.getAttribute("sw-speed") || 1000;
    this.speedMobile = +this.getAttribute("sw-speed-mobile") || 1000;
    this.spaceBetween = 0;
    this.thumbnails = this.getAttribute("sw-thumbs");
    this.thumbnailsSlider = this.root.querySelector(".product-gallery__carousel--thumbs");
    this.thumbnailsDirection = this.getAttribute("sw-thumbs-direction");
    this.zoom = this.getAttribute("sw-zoom") === "true" && !this.closest("#product-quick-view");
    this.zoomSize = parseFloat(this.getAttribute("sw-zoom-size")) || 3;

    this.#maybeInitSwiper();

    window.addEventListener("resize", this.handleResize); // Update on resize
    document.addEventListener("jumpseller:subsection:select", this.handleSubSectionSelect);
    document.addEventListener("jumpseller:section:select", this.handleSectionSelect);
    document.addEventListener("jumpseller:section:deselect", this.handleSectionDeselect);
    if (this.autoplay) {
      this.visibilityObserver = new IntersectionObserver(this.#handleVisibilityChange.bind(this), { threshold: 0.5 });
      this.visibilityObserver.observe(this);
    }
  }

  #handleResize() {
    this.#maybeInitSwiper();
    this.#updatePaginationType();
  }

  #maybeInitSwiper() {
    const type = this.dataset.type || this.getAttribute("data-type");
    if (type !== "grid") {
      this.#initSwiper();
      return;
    }

    const isMobile = window.innerWidth < 768;
    if (isMobile && !this.swiper) {
      this.#initSwiper();
    } else if (!isMobile && this.swiper) {
      this.swiper.destroy();
      this.swiper = null;
    }
  }

  disconnectedCallback() {
    SwiperSlider.indexCache[this.root.id] = this.swiper?.activeIndex || 0;
    window.removeEventListener("resize", this.handleResize);
    document.removeEventListener("jumpseller:subsection:select", this.handleSubSectionSelect);
    document.removeEventListener("jumpseller:section:select", this.handleSectionSelect);
    document.removeEventListener("jumpseller:section:deselect", this.handleSectionDeselect);
    this.swiper?.destroy();
    this.visibilityObserver?.disconnect();
  }

  // Reconstruct the swiper with a new set of slides.
  rebuild(fragment, append = false) {
    this.swiper?.destroy();
    const wrapper = this.querySelector(".swiper-wrapper");
    if (append) this.items?.forEach((item) => fragment.append(item));
    wrapper.innerHTML = "";
    wrapper.append(fragment);
    this.#initSwiper();
  }

  #handleVisibilityChange([entry]) {
    entry.isIntersecting ? this.swiper.autoplay.start() : this.swiper.autoplay.stop();
  }

  #updateIndex(event) {
    if (!this.swiper) return;

    const {
      detail: { root, index },
    } = event;

    if (`theme-section-${root}` !== this.section_id) return;

    this.swiper.slideTo(index);
  }

  #updateAutoplay(event) {
    if (!this.swiper || !this.autoplay) return;

    const {
      type,
      detail: { id },
    } = event;
    const isTargetSection = `theme-section-${id}` === this.section_id;
    const startAutoplay = () => this.autoplay && this.swiper.autoplay.start();

    if (!isTargetSection) return startAutoplay();

    const stopAutoplay = () => this.autoplay && this.swiper.autoplay.stop();

    if (type === "jumpseller:section:select") {
      stopAutoplay();
    } else if (type === "jumpseller:section:deselect") {
      startAutoplay();
    }
  }

  #autoplay() {
    if (!this.autoplay) return false;

    return this.autoplayContinuous
      ? { delay: 0, disableOnInteraction: true, pauseOnMouseEnter: true }
      : { delay: this.speed, disableOnInteraction: false, pauseOnMouseEnter: true };
  }

  #navigation() {
    const nextEl = this.root.querySelector(".swiper-button-next");
    const prevEl = this.root.querySelector(".swiper-button-prev");
    return nextEl && prevEl ? { nextEl, prevEl } : false;
  }

  #pagination() {
    const pagination = this.root.querySelector(".swiper-pagination");
    return pagination ? { el: pagination, clickable: true, type: "bullets" } : false; // Default type as 'bullets'
  }

  #updatePaginationType() {
    if (!this.swiper) return;

    const viewportWidth = window.innerWidth;
    const paginationType = viewportWidth < 768 ? "fraction" : "bullets";

    // Ensure pagination params is an object
    if (typeof this.swiper.params.pagination === "object") {
      this.swiper.params.pagination.type = paginationType;

      // Remove old pagination classes and add the new one
      if (this.swiper.pagination.el) {
        this.swiper.pagination.el.classList.remove("swiper-pagination-fraction", "swiper-pagination-bullets");
        this.swiper.pagination.el.classList.add(`swiper-pagination-${paginationType}`);
      }

      // Reinitialize the swiper pagination to apply changes
      this.swiper.pagination.init();
      this.swiper.pagination.render();
      this.swiper.pagination.update();
    }
  }

  #layout() {
    const layouts = {
      one: { slidesPerView: 1 },
      "top-bar": {
        slidesPerView: this.columns,
      },
      products: {
        slidesPerView: 1,
        breakpoints: {
          0: { slidesPerView: this.columnsMobile },
          419: { slidesPerView: this.columnsMobile },
          576: { slidesPerView: 3 },
          768: { slidesPerView: this.columnsTablet },
          992: { slidesPerView: this.columnsDesktop == 5 ? 4 : this.columnsDesktop },
          1336: { slidesPerView: this.columnsDesktop },
        },
      },
      "wishlist-component": {
        slidesPerView: 1,
        breakpoints: {
          0: { slidesPerView: this.columnsMobile },
          576: { slidesPerView: 2 },
          992: { slidesPerView: this.columnsDesktop },
        },
      },
      "product-collection": {
        slidesPerView: 1,
        breakpoints: {
          0: { slidesPerView: this.columnsMobile },
          419: { slidesPerView: this.columnsMobile },
          576: { slidesPerView: 3 },
          768: { slidesPerView: this.columnsTablet },
          992: { slidesPerView: this.columnsDesktop == 5 ? 4 : this.columnsDesktop },
          1336: { slidesPerView: this.columnsDesktop },
        },
      },
      slider: {
        slidesPerView: 1,
      },
      banners: {
        slidesPerView: 1,
        breakpoints: {
          0: { slidesPerView: this.columnsMobileSmall },
          419: { slidesPerView: this.columnsMobile },
          576: { slidesPerView: this.columnsDesktop >= 2 ? 2 : 1 },
          768: { slidesPerView: this.columnsDesktop >= 3 ? 3 : this.columnsDesktop === 2 ? 2 : 1 },
          992: { slidesPerView: this.columnsDesktop },
        },
      },
      testimonials: {
        slidesPerView: 1,
        breakpoints: {
          0: { slidesPerView: 1 },
          419: { slidesPerView: this.columnsMobile },
          768: { slidesPerView: this.columnsDesktop >= 3 ? 3 : this.columnsDesktop === 2 ? 2 : 1 },
          992: { slidesPerView: this.columnsDesktop },
        },
      },
      "information-cards": {
        disableOnInteraction: true,
        slidesPerView: 1,
        breakpoints: {
          0: { slidesPerView: 1 },
          419: { slidesPerView: this.columnsMobile },
          576: { slidesPerView: this.columnsDesktop === 1 ? 1 : this.columnsDesktop === 2 ? 2 : 2 },
          768: {
            slidesPerView:
              this.columnsDesktop === 1 ? 1 : this.columnsDesktop === 2 ? 2 : this.columnsDesktop === 3 ? 3 : 3,
          },
          992: {
            slidesPerView:
              this.columnsDesktop === 1 ? 1 : this.columnsDesktop === 2 ? 2 : this.columnsDesktop === 3 ? 3 : 4,
          },
        },
      },
      "logo-gallery": {
        slidesPerView: 2,
        breakpoints: {
          0: { slidesPerView: 2 },
          419: { slidesPerView: this.columnsMobile },
          768: { slidesPerView: 3 },
          992: { slidesPerView: 4 },
          1200: { slidesPerView: this.columnsDesktop },
        },
      },
      "featured-reviews": {
        slidesPerView: 1,
        breakpoints: {
          0: { slidesPerView: 1 },
          576: { slidesPerView: this.columnsDesktop >= 2 ? 2 : 1 },
          768: { slidesPerView: this.columnsDesktop >= 2 ? 2 : this.columnsDesktop === 2 ? 2 : 1 },
          992: { slidesPerView: this.columnsDesktop },
        },
      },
      "product-reviews": {
        slidesPerView: 1,
        breakpoints: {
          0: { slidesPerView: 1 },
          576: { slidesPerView: this.columnsDesktop >= 2 ? 2 : 1 },
          768: { slidesPerView: this.columnsDesktop >= 2 ? 2 : this.columnsDesktop === 2 ? 2 : 1 },
          992: { slidesPerView: this.columnsDesktop },
        },
      },
      "trust-bar": {
        slidesPerView: 1,
        breakpoints: {
          0: { slidesPerView: 1 },
          419: { slidesPerView: this.columnsMobile },
          768: { slidesPerView: this.columnsDesktop >= 3 ? 3 : this.columnsDesktop === 2 ? 2 : 1 },
          992: { slidesPerView: this.columnsDesktop },
        },
      },
      "page-category-articles": {
        slidesPerView: 1,
        breakpoints: {
          0: { slidesPerView: 1 },
          419: { slidesPerView: this.columnsMobile },
          576: { slidesPerView: this.columnsDesktop >= 2 ? 2 : 1 },
          768: { slidesPerView: this.columnsDesktop === 1 ? 1 : 2 },
          992: { slidesPerView: this.columnsDesktop },
        },
      },
      videos: {
        slidesPerView: 1,
        breakpoints: {
          0: { slidesPerView: 1 },
          419: { slidesPerView: 2 },
          768: { slidesPerView: 3 },
          992: { slidesPerView: this.columns },
        },
      },
      instagram: {
        slidesPerView: 2,
        breakpoints: {
          0: { slidesPerView: 2 },
          419: { slidesPerView: this.columnsMobile },
          768: { slidesPerView: 4 },
          992: { slidesPerView: 5 },
          1200: { slidesPerView: this.columnsDesktop },
        },
      },
      "product-gallery": {
        slidesPerView: 1,
        thumbs: {
          swiper: this.thumbnailsSlider,
        },
        zoom: {
          panOnMouseMove: true,
          toggle: false,
        },
        on: {
          init: this.#swiperOnInit,
          destroy: this.#swiperOnDestroy,
        },
      },
      "product-gallery-thumbs": {
        slidesPerView: 3,
        loop: true,
        freeMode: false,
        breakpoints: {
          0: {
            direction: "horizontal",
            slidesPerView: 3,
          },
          576: {
            direction: "horizontal",
            slidesPerView: 4,
          },
          768: {
            direction: "horizontal",
            slidesPerView: 3,
          },
          992: {
            slidesPerView: 4,
            direction: this.thumbnailsDirection,
          },
        },
      },
      "bought-together": {
        slidesPerView: 1,
        breakpoints: {
          0: {
            slidesPerView: 1,
          },
          576: {
            slidesPerView: this.layoutType === "single" ? 1 : 2,
          },
          991: {
            slidesPerView: this.columnsDesktop,
          },
        },
      },
      categories: {
        slidesPerView: 1,
        breakpoints: {
          0: { slidesPerView: this.columnsMobile },
          576: { slidesPerView: this.columnsDesktop >= 2 ? 2 : 1 },
          768: { slidesPerView: this.columnsDesktop >= 3 ? 3 : this.columnsDesktop === 2 ? 2 : 1 },
          992: { slidesPerView: this.columnsDesktop },
        },
      },
      "recently-viewed": {
        slidesPerView: 1,
        breakpoints: {
          0: { slidesPerView: this.columnsMobile },
          419: { slidesPerView: this.columnsMobile },
          576: { slidesPerView: 3 },
          768: { slidesPerView: this.columnsTablet },
          992: { slidesPerView: this.columnsDesktop == 5 ? 4 : this.columnsDesktop },
          1336: { slidesPerView: this.columnsDesktop },
        },
      },
    };
    if (Object.prototype.hasOwnProperty.call(layouts, this.layout)) return layouts[this.layout];
    else throw new Error(`Missing or invalid sw-layout in swiper-slider: ${this.layout}`);
  }

  #zoomIn = () => {
    const zoom = this.swiper.zoom;
    if (zoom.scale && zoom.scale > 1) zoom.out();
    else zoom.in(this.zoomSize);
  };

  #zoomOut = () => {
    const zoom = this.swiper.zoom;
    if (zoom.scale && zoom.scale > 1) zoom.out();
  };

  #swiperOnInit = () => {
    if (!this.zoom) return;

    this.items.forEach((slide) => {
      slide.addEventListener("mouseenter", this.#zoomIn);
      slide.addEventListener("mouseleave", this.#zoomOut);
    });
  };

  #swiperOnDestroy = () => {
    if (!this.zoom) return;

    this.items.forEach((slide) => {
      slide.removeEventListener("mouseenter", this.#zoomIn);
      slide.removeEventListener("mouseleave", this.#zoomOut);
    });
  };

  #swiperConfig() {
    const isMobile = window.innerWidth < 768;
    const selectedSpeed = isMobile ? this.speedMobile : this.speed;

    return {
      spaceBetween: this.spaceBetween,
      direction: this.direction,
      rewind: this.rewind && !this.loop && this.items.length > 1,
      freeMode: this.freeMode,
      loop: this.autoplayContinuous ? true : false,
      speed: this.autoplayContinuous ? selectedSpeed : 1000,
      delay: this.autoplayContinuous ? 0 : selectedSpeed,
      effect: this.effect,
      observer: this.observer,
      observeParents: this.observer,
      autoHeight: this.autoHeight,
      grabCursor: this.grab,
      watchSlidesProgress: true,
      navigation: this.#navigation(),
      pagination: this.#pagination(),
      autoplay: this.#autoplay(),
      a11y: {
        enabled: true,
        slideRole: "presentation",
      },
      initialSlide: SwiperSlider.indexCache[this.root.id] || 0,
      ...this.#layout(),
    };
  }

  #decideLoadingMethod(slide, slideIdx) {
    // if the slide is visible on the first non scrolled view set the loading to eager
    if (this.root.getBoundingClientRect().top <= window.innerHeight) {
      const visibleSlides = window.innerWidth < 768 ? this.columnsMobile : this.columnsDesktop;
      const img = slide.querySelector("img");
      if (img) img.setAttribute("loading", slideIdx < visibleSlides ? "eager" : "lazy");
    }
  }

  #initSwiper() {
    this.items = this.querySelectorAll(".swiper-slide");
    this.swiper = new Swiper(this, this.#swiperConfig());
    this.items.forEach((slide, slideIdx) => {
      slide.setAttribute("role", "region");
      this.#decideLoadingMethod(slide, slideIdx);
    });

    this.#updatePaginationType(); // Ensure the pagination type is set correctly after Swiper is initialized
  }
}
window.customElements.define("swiper-slider", SwiperSlider);

class RecentlyViewedProducts extends CustomHTMLElement {
  constructor() {
    super();
    this.limit = +this.getAttribute("data-limit-min") || 4;
  }

  initialize() {
    this.fetchViewedProducts();
  }

  async fetchViewedProducts() {
    let visitedProducts = localStorage.getItem("visitedProductIDs");
    visitedProducts = visitedProducts ? JSON.parse(visitedProducts) : [];

    if (visitedProducts.length === 0) {
      this.style.display = "none";
      return; // Exit early if there are no visited products
    }

    const dataLimit = +this.getAttribute("data-limit") || 10;
    const idsString = visitedProducts.slice(0, dataLimit).join(",");

    const res = await localizedFetch(`/search?sections=product-feed&omit_filters=true&only_products=${idsString}`);
    const feed = await res.text();
    const dom = new DOMParser().parseFromString(feed, "text/html");
    const pbs = dom.querySelectorAll(".product-block");
    const isCarousel = this.getAttribute("data-display") === "carousel";

    const nodepool = {};
    pbs.forEach((node) => {
      Array.from(node.attributes)
        .filter((attr) => attr.name.startsWith("data-aos"))
        .forEach((attr) => node.removeAttribute(attr.name));
      node.classList.add("product-block--natively-animated");
      nodepool[node.dataset.productId] = node;
    });

    if (isCarousel) pbs.forEach((node) => node.classList.add("swiper-slide"));
    const ids = visitedProducts.filter((id) => nodepool[id]);

    const fragment = document.createDocumentFragment();
    ids.forEach((id) => fragment.append(nodepool[id]));
    SwiperSlider.rebuildContainer(this, ".theme-section__content", fragment, false);
  }

  // This forces callers to be declared later => a product page using this
  // web component will not instantly reflect the product being visited
  static pushProduct(id) {
    id = +id;
    if (isNaN(id) || id <= 0) return;

    let visitedProducts = localStorage.getItem("visitedProductIDs");
    visitedProducts = visitedProducts ? JSON.parse(visitedProducts) : [];
    visitedProducts.unshift(id);
    visitedProducts = visitedProducts.filter((v, i) => visitedProducts.indexOf(v) === i).slice(0, 40);
    localStorage.setItem("visitedProductIDs", JSON.stringify(visitedProducts));
  }
}
window.customElements.define("recently-viewed", RecentlyViewedProducts);

class FeatureReview extends CustomHTMLElement {
  constructor() {
    super();
  }

  disconnectedCallback() {
    if (this.showMore) this.showMore.removeEventListener("click", this.handleToggle);
    if (this.showLess) this.showLess.removeEventListener("click", this.handleToggle);
  }

  initialize() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.buildShowButtons());
    } else {
      this.buildShowButtons();
    }
  }

  buildShowButtons() {
    this.reviewContent = this.querySelector(".review-block__content");
    if (!this.reviewContent || this.reviewContent.scrollHeight <= this.reviewContent.clientHeight) return;

    this.showMore = this.querySelector("#show-more");
    this.showLess = this.querySelector("#show-less");

    if (this.showMore) {
      this.showMore.innerHTML = `<span>${I18N.show_more} <i class="ph ph-caret-down"></i></span>`;
      this.showMore.style.display = "inline-block";
      this.showMore.addEventListener("click", this.handleToggle);
    }

    if (this.showLess) {
      this.showLess.innerHTML = `<span>${I18N.show_less} <i class="ph ph-caret-up"></i></span>`;
      this.showLess.style.display = "none";
      this.showLess.addEventListener("click", this.handleToggle);
    }
  }

  handleToggle = (event) => {
    const isExpanding = event.currentTarget === this.showMore;
    this.reviewContent.classList.toggle("expanded", isExpanding);
    this.showMore.style.display = isExpanding && this.showMore ? "none" : "inline-block";
    this.showLess.style.display = isExpanding && this.showLess ? "inline-block" : "none";
  };
}
window.customElements.define("feature-review", FeatureReview);

class ProductReviews extends CustomHTMLElement {
  constructor() {
    super();
  }

  initialize() {
    this.product = +this.getAttribute("data-productid");
    this.limit = +this.getAttribute("data-limit") || 6;
    this.reviewsClass = this.getAttribute("data-reviews-class");
    this.reviewsColumns = this.getAttribute("data-reviews-columns");
    this.reviewsSpacing = this.getAttribute("data-reviews-spacing");
    this.reviewsStyle = this.getAttribute("data-reviews-style");
    this.reviewsStyleBundle = this.getAttribute("data-reviews-style-bundle");
    this.reviewsStyleBorder = this.getAttribute("data-reviews-style-border");
    this.nameFilter = this.getAttribute("data-name-filter");
    this.reviewsPage = 1;
    this.sort = "date_desc";
    this.currentSortText = $(".product-reviews__current-sort");
    this.loadingIcon = $(".product-reviews__loading");
    this.moreReviewsButton = $("#load-more-reviews");
    this.moreReviewsButton.on("click", () => this.insertReviews());
    this.registerSorters();
    this.resetReviews();
    this.insertReviews();
  }

  disconnectedCallback() {
    this.moreReviewsButton.off("click");
    $("a[pr-sort]", this).off("click");
  }

  registerSorters() {
    const self = this;
    $("a[pr-sort]", this).on("click", function () {
      const element = this;
      $("a[pr-sort]", self).removeClass("active theme-dropdown__link--active");
      const link = $(element);
      link.addClass("active").addClass("theme-dropdown__link--active");
      self.sort = link.attr("pr-sort");
      self.currentSortText.text(link.text());
      self.resetReviews();
      self.insertReviews();
    });
  }

  resetReviews() {
    this.reviewsPage = 1;
  }

  async insertReviews() {
    this.moreReviewsButton.hide();
    this.loadingIcon.show();

    const fragment = document.createDocumentFragment();

    try {
      const data = await Jumpseller.fetchReviews(this.product, this.reviewsPage++, this.sort, this.limit);
      const { reviews, page_count } = data;

      reviews.forEach((review) => {
        fragment.append(this.buildReviewHtml(review.text, review.rating, review.customer, review.date));
      });
      SwiperSlider.rebuildContainer(this, ".product-reviews__wrapper", fragment, true);

      setTimeout(() => {
        this.updateExpandReviewTextButtonsVisibility();
      }, 100);
      this.moreReviewsButton.toggle(this.reviewsPage <= page_count);
    } catch (err) {
      this.moreReviewsButton.show();
      console.error(err);
    }

    this.loadingIcon.hide();
  }

  buildReviewHtml(text, rating, customer, date) {
    const emptyStar = `<span class="ph-fill ph-star product-ratings__star"></span>`;
    const filledStars = `<span class="ph-fill ph-star product-ratings__star product-ratings__star--filled"></span>`;
    const showMoreButton = $(
      `<button class="review-block__expand">${I18N.show_more} <i class="ph ph-caret-down"></i></button>`,
    );
    const showLessButton = $(
      `<button class="review-block__expand">${I18N.show_less} <i class="ph ph-caret-up"></i></button>`,
    );

    showMoreButton.on("click", function () {
      const reviewBlock = $(this).closest(".review-block");
      reviewBlock.find(".review-block__content").addClass("expanded");
      $(this).hide();
      reviewBlock.find(".review-block__expand:last").show();
    });

    showLessButton.on("click", function () {
      const reviewBlock = $(this).closest(".review-block");
      reviewBlock.find(".review-block__content").removeClass("expanded");
      $(this).hide();
      reviewBlock.find(".review-block__expand:first").show();
    });

    const review = $(`
      <div class="theme-block review-block ${this.reviewsClass}" data-columns-mobile="1" data-columns-desktop="${this.reviewsColumns}" data-spacing="${this.reviewsSpacing}">
        <div class="theme-block__wrapper review-block__wrapper">
          <div class="review-block__content check-empty">${text}</div>
          <div class="review-block__rating">
            <div class="product-ratings">
              <span class="product-ratings__score">${rating}</span>
              <span class="product-ratings__divider"></span>
              <div class="product-ratings__stars">
                ${filledStars.repeat(rating)}
                ${emptyStar.repeat(5 - rating)}
              </div>
            </div>
          </div>
          <div class="review-block__footer">
            <div class="review-block__customer${customer === null ? " hidden" : ""}">${this.nameFilter === "first_name" ? customer.split(" ")[0] : customer}</div>
            <div class="review-block__date${date === null ? " hidden" : ""}">${date}</div>
          </div>
        </div>
      </div>
    `);

    review.find(".review-block__content").after(showLessButton.hide()).after(showMoreButton);

    if (this.reviewsStyle === "true") {
      review.attr("data-card", "true");
      review.attr("data-card-border", this.reviewsStyleBorder);
      review.attr("data-bundle-color", this.reviewsStyleBundle);
    }

    return review.get(0);
  }

  updateExpandReviewTextButtonsVisibility() {
    $(".review-block", this).each(function () {
      const reviewBlock = $(this);
      const reviewText = reviewBlock.find(".review-block__content");
      const showMoreButton = reviewBlock.find(".review-block__expand").first();
      const showLessButton = reviewBlock.find(".review-block__expand").last();

      if (showMoreButton.length === 0 || showLessButton.length === 0) return;

      showMoreButton.toggle(reviewText[0].scrollHeight > reviewText[0].clientHeight);
      showLessButton.hide();
    });
  }
}
window.customElements.define("product-reviews", ProductReviews);

class ProductStockLocations extends CustomHTMLElement {
  constructor() {
    super();
  }

  initialize() {
    const firstRenderedProductId = +this.getAttribute("data-productid");
    this.stockLocationsData = JSON.parse(this.querySelector("script.product-stock-locations-json").textContent);
    this.minimumToBuy = this.#getminimumToBuy() ?? 1;
    this.buildStockLocations(firstRenderedProductId);
  }

  #getminimumToBuy() {
    const formJson = document.querySelector("product-form script.product-form-json");
    if (!formJson) return 1;

    try {
      const parsedFormJson = JSON.parse(formJson.textContent);
      const minimumQuantity = parsedFormJson.info.product.minimum_quantity;
      return minimumQuantity > 0 ? minimumQuantity : 1;
    } catch (error) {
      console.error("Failed to parse minimum quantity from product-form-json", error);
      return 1;
    }
  }

  buildStockLocations(productId) {
    if (typeof this.stockLocationsData === "undefined") {
      return;
    }

    if (this.stockLocationsData.info.product.type === "appointment") {
      this.classList.add("hidden");
      return;
    }

    const product =
      this.stockLocationsData.info.variants.length === 0
        ? this.stockLocationsData.info.product
        : this.stockLocationsData.info.variants.find((x) => x.id === productId);

    if (product.status === "not-available" || this.stockLocationsData.info.stockOrigins.length <= 1) {
      $("product-stock-locations").addClass("hidden");
      return;
    }

    $(".product-stock-locations__content").html(
      this.stockLocationsData.info.stockOrigins
        .map((location) => this.#buildStockLocationEntry(product, location))
        .filter(Boolean)
        .join(""),
    );
  }

  #buildLowStockBadge(lowStockIcon, stock, version) {
    const badge = (icon, text, textExact) => `
      <div class="product-stock-locations__status product-stock--${version}" data-label="lowstock">
        ${icon}
        <span class="product-stock__text">${text}</span>
        <span class="product-stock__text-exact">${formatTranslation(textExact, { qty: stock })}</span>
      </div>
    `;

    switch (version) {
      case "basic":
        return badge(lowStockIcon, I18N.low_stock_basic, I18N.low_stock_basic_exact);
      case "limited":
        return badge(lowStockIcon, I18N.low_stock_limited, I18N.low_stock_limited_exact);
      case "alert":
        return badge('<i class="ph ph-fill ph-hourglass-low"></i>', I18N.low_stock_alert, I18N.low_stock_alert_exact);
      default:
        return "";
    }
  }

  #buildStockLocationEntry(product, location) {
    const stockLocation = product.stock_locations.find((item) => item.location_name === location.name);
    const stockValue = stockLocation ? stockLocation.stock : null;

    const stockLocationIcons = {
      available: `<i class="ph-fill ph-circle product-stock__icon product-stock__icon--available"></i>`,
      "low-stock": `<i class="ph-fill ph-circle product-stock__icon product-stock__icon--low-stock"></i>`,
      "out-of-stock": `<i class="ph-fill ph-circle product-stock__icon product-stock__icon--out-of-stock"></i>`,
    };

    let locationAvailabilityHtml = "";
    if (product.stock_unlimited) {
      locationAvailabilityHtml = `
        <div class="product-stock-locations__status" data-label="available">
          ${stockLocationIcons["available"]}
          <span>${I18N.available_in_stock}</span>
        </div>
      `;
    } else if (stockValue < this.minimumToBuy || product.stock < this.minimumToBuy) {
      locationAvailabilityHtml = `
        <div class="product-stock-locations__status" data-label="out-of-stock">
          ${stockLocationIcons["out-of-stock"]}
          <span>${I18N.out_of_stock}</span>
        </div>
      `;
    } else if (product.stock_notification && stockValue >= this.minimumToBuy && stockValue <= product.stock_threshold) {
      locationAvailabilityHtml = this.#buildLowStockBadge(
        stockLocationIcons["low-stock"],
        stockValue,
        this.stockLocationsData.options.low_stock_version,
      );
    } else if (stockValue >= this.minimumToBuy) {
      locationAvailabilityHtml = `
        <div class="product-stock-locations__status" data-label="available">
          ${stockLocationIcons["available"]}
          <span class="product-stock__text">${I18N.available_in_stock}</span>
          <span class="product-stock__text-exact">${formatTranslation(I18N.x_units_in_stock, { qty: stockValue })}</span>
        </div>
      `;
    }

    const geoLocationText = [location.municipality, location.region, location.country].filter(Boolean).join(", ");
    const geoLocationMap =
      location.latitude && location.longitude
        ? `<a class="product-stock-locations__link" href="https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}" title="${I18N.product_stock_locations_link_text}" target="_blank"><i class="ph-fill ph-navigation-arrow"></i></a>`
        : "";

    return `
          <div class="product-stock-locations__entry">
            <div class="product-stock-locations__heading">
              <span class="product-stock-locations__name">${location.name}</span>
              ${geoLocationMap}
            </div>
            <span class="product-stock-locations__geolocation">${geoLocationText}</span>
            <span class="product-stock-locations__address">${location.address_with_street_number}</span>
            ${locationAvailabilityHtml}
          </div>
        `;
  }
}
window.customElements.define("product-stock-locations", ProductStockLocations);

class ProductStock extends CustomHTMLElement {
  constructor() {
    super();
  }

  initialize() {
    this.stockLocationIcons = {
      available: `<i class="ph-fill ph-circle product-stock__icon product-stock__icon--available"></i>`,
      "low-stock": `<i class="ph-fill ph-circle product-stock__icon product-stock__icon--low-stock"></i>`,
      "out-of-stock": `<i class="ph-fill ph-circle product-stock__icon product-stock__icon--out-of-stock"></i>`,
    };

    this.script = this.querySelector(`script.product-stock-json`);
    this.data = JSON.parse(this.script.textContent);
    this.options = this.data.options;
    this.buildStock(this.data.info.product);
  }

  hide() {
    this.classList.add("hidden");
  }

  show() {
    this.classList.remove("hidden");
  }

  buildLowStockBadge(stock) {
    this.classList.add(`product-stock--${this.options.low_stock_version}`);
    switch (this.options.low_stock_version) {
      case "basic":
        return `
          ${this.stockLocationIcons["low-stock"]}
          <span class="product-stock__text">${I18N.low_stock_basic}</span>
          <span class="product-stock__text-exact">${formatTranslation(I18N.low_stock_basic_exact, { qty: stock })}</span>
        `;
      case "limited":
        return `
          ${this.stockLocationIcons["low-stock"]}
          <span class="product-stock__text">${I18N.low_stock_limited}</span>
          <span class="product-stock__text-exact">${formatTranslation(I18N.low_stock_limited_exact, { qty: stock })}</span>
        `;
      case "alert":
        return `
          <i class="ph ph-fill ph-hourglass-low"></i>
          <span class="product-stock__text">${I18N.low_stock_alert}</span>
          <span class="product-stock__text-exact">${formatTranslation(I18N.low_stock_alert_exact, { qty: stock })}</span>
        `;
      default:
        return "";
    }
  }

  buildStock(product) {
    this.show();
    if ((product.status === "not-available" && !product.quotable) || this.options.disableShoppingCart) {
      this.hide();
      this.setAttribute("data-label", "out-of-stock");
      return;
    }

    let productStockHtml = "";
    this.classList.remove(`product-stock--${this.options.low_stock_version}`);
    const minimumToBuy =
      this.data.info.product.minimum_quantity && this.data.info.product.minimum_quantity > 0
        ? this.data.info.product.minimum_quantity
        : 1;
    if (product.stock_unlimited) {
      this.setAttribute("data-label", "available");
      productStockHtml = `
        ${this.stockLocationIcons["available"]}
        <span>${I18N.available_in_stock}</span>
      `;
    } else if (product.stock < minimumToBuy) {
      this.setAttribute("data-label", "out-of-stock");
      productStockHtml = `
        ${this.stockLocationIcons["out-of-stock"]}
        <span>${I18N.out_of_stock}</span>
      `;
    } else if (
      product.stock_notification &&
      product.stock >= minimumToBuy &&
      product.stock <= product.stock_threshold
    ) {
      this.setAttribute("data-label", "lowstock");
      productStockHtml = this.buildLowStockBadge(product.stock);
    } else if (product.stock >= minimumToBuy) {
      this.setAttribute("data-label", "available");
      productStockHtml = `
        ${this.stockLocationIcons["available"]}
        <span class="product-stock__text">${I18N.available_in_stock}</span>
        <span class="product-stock__text-exact">${formatTranslation(I18N.x_units_in_stock, { qty: product.stock })}</span>
      `;
    }

    this.innerHTML = this.script.outerHTML + productStockHtml;
  }
}
window.customElements.define("product-stock", ProductStock);

class ProductForm extends CustomHTMLElement {
  constructor() {
    super();
  }

  initialize() {
    this.buildProductForm();
  }

  getIsOutOfStock() {
    return this.isOutOfStock;
  }

  replaceHtml(html) {
    this.innerHTML = this.script.outerHTML + html;
  }

  buildProductForm(variant) {
    this.script = this.querySelector(`script.product-form-json`);
    this.data = JSON.parse(this.script.textContent);
    this.options = this.data.options;
    this.status = this.data.info.status;
    this.product = this.data.info.product;
    this.isOutOfStock = false;
    this.variant = typeof variant === "undefined" || variant === null ? this.data.info.variant : variant;
    this.variant.price_with_discount = this.variant.discount
      ? this.variant.price - this.variant.discount
      : this.variant.price;

    if (
      !this.querySelector("#product-status-out-of-stock") &&
      this.product.status !== "not-available" &&
      !this.options.disableShoppingCart
    ) {
      this.insertAdjacentHTML("beforeend", this.#getOutOfStockSection());
    }

    const productFormInput = this.querySelector(".product-form__input");
    const productFormButton = this.querySelector("button#add-to-cart");
    const productFormHandler = this.querySelector(".product-form__handler");
    const productFormOptions = this.querySelector(".product-options");
    const productFormActions = this.querySelector(".product-form__actions");
    const productOutOfStockSection = this.querySelector("#product-status-out-of-stock");
    const productFormWrapper = this.querySelector(".product-form__wrapper");
    const quantity = +productFormInput.value;
    const minimumToBuy = this.product.minimum_quantity > 0 ? this.product.minimum_quantity : 1;
    if (!productFormInput || !productFormButton || !productFormHandler || !productFormActions) {
      console.error("Some components are missing in product-form");
      return;
    }

    if (this.options.disableShoppingCart) {
      this.isOutOfStock = false;
      if (productFormOptions) productFormOptions.classList.remove("hidden");
      productFormActions.classList.add("hidden");
      const disabledShoppingFeaturesSection = this.querySelector("#product-status-shopping-disabled");
      if (!disabledShoppingFeaturesSection) this.innerHTML += this.#getDisableShoppingFeaturesSection();
    } else if (this.product.status === "not-available" && !this.product.quotable) {
      this.isOutOfStock = false;
      if (productFormOptions) productFormOptions.classList.add("hidden");
      productFormActions.classList.add("hidden");
      this.replaceHtml(this.#getNotAvailableSection());
    }
    // out of stock for all variants (or just product)
    else if (this.data.info.product.stock < minimumToBuy && this.data.info.product.stock_unlimited === false) {
      this.isOutOfStock = true;
      if (productFormOptions) productFormOptions.classList.remove("hidden");
      if (productOutOfStockSection) productOutOfStockSection.classList.remove("hidden");
      if (!this.product.quotable || !productFormWrapper) {
        productFormActions.classList.add("hidden");
      } else {
        productFormActions.classList.remove("hidden");
        for (const child of productFormWrapper.children) {
          child.classList.toggle("hidden", child.id !== "request-quote");
        }
      }

      if (this.variant) this.#changeBackInStockUrl(this.variant.id);
    }
    // out of stock for selected variant
    else if (this.variant.stock < minimumToBuy && this.variant.stock_unlimited === false) {
      this.isOutOfStock = true;
      this.#changeBackInStockUrl(this.variant.id);
      if (productOutOfStockSection) productOutOfStockSection.classList.remove("hidden");
      if (productFormOptions) productFormOptions.classList.remove("hidden");
      productFormActions.classList.remove("hidden");
      productFormButton.disabled = true;
      productFormHandler.disabled = true;
      productFormButton.querySelector("span").textContent = I18N.out_of_stock;
      productFormInput.disabled = true;
      productFormInput.value = 1;
      productFormInput.setAttribute("max", 1);
    }
    // available with stock
    else {
      this.isOutOfStock = false;
      if (productFormOptions) productFormOptions.classList.remove("hidden");
      productFormActions.classList.remove("hidden");
      productFormButton.disabled = false;
      productFormHandler.disabled = false;
      productFormButton.querySelector("span").textContent = I18N.add_to_cart;
      if (productOutOfStockSection) productOutOfStockSection.classList.add("hidden");
      productFormInput.disabled = false;
      let maximumToBuy = Infinity;

      if (this.product.maximum_quantity && this.product.maximum_quantity > 0) {
        maximumToBuy = Math.min(maximumToBuy, this.product.maximum_quantity);
      }

      if (!this.variant.stock_unlimited) {
        const stockLimit = this.variant.stock;
        if (stockLimit) maximumToBuy = Math.min(maximumToBuy, stockLimit);
      }

      const effectiveMaximum = maximumToBuy < minimumToBuy ? minimumToBuy : maximumToBuy;
      const newValue = Math.min(Math.max(quantity, minimumToBuy), effectiveMaximum);
      productFormInput.setAttribute("min", minimumToBuy);
      productFormInput.value = newValue;

      if (Number.isFinite(effectiveMaximum)) productFormInput.setAttribute("max", effectiveMaximum);
      else productFormInput.removeAttribute("max");

      const minusButton = this.querySelector(".quantity-down");
      if (minusButton) minusButton.disabled = newValue <= minimumToBuy;

      const plusButton = this.querySelector(".quantity-up");
      if (plusButton) plusButton.disabled = Number.isFinite(effectiveMaximum) && newValue >= effectiveMaximum;

      const buyNowButton = this.querySelector("#buy-now-button");
      if (buyNowButton) {
        const canBuy = canBuyNow({
          quantity: newValue,
          minQuantity: minimumToBuy,
          price: this.variant.price_with_discount,
        });
        buyNowButton.disabled = !canBuy;
        buyNowButton.querySelector("span").textContent = canBuy ? I18N.buy_now : I18N.buy_now_not_allowed;
      }
    }

    const data = JSON.parse(this.querySelector(`script.product-form-json`).textContent);
    RecentlyViewedProducts.pushProduct(data.info.product.id);
  }

  disableAddToCartAndBuyNow() {
    const addToCartButton = this.querySelector("#add-to-cart");
    const buyNowButton = this.querySelector("#buy-now-button");
    if (addToCartButton) addToCartButton.disabled = true;
    if (buyNowButton) buyNowButton.disabled = true;
  }

  enableAddToCartAndBuyNow() {
    const addToCartButton = this.querySelector("#add-to-cart");
    addToCartButton.querySelector("span").textContent = I18N.add_to_cart;
    const buyNowButton = this.querySelector("#buy-now-button");
    if (addToCartButton) addToCartButton.disabled = false;
    if (buyNowButton) buyNowButton.disabled = false;
  }

  #changeBackInStockUrl(variantId = null) {
    const backInStockUrl = this.product.back_in_stock_url + (variantId === null ? "" : `?variant_id=${variantId}`);
    const backInStockLink = this.querySelector("#product-status-back-in-stock");
    if (backInStockLink) backInStockLink.setAttribute("href", backInStockUrl);
  }

  #getStatusBackInStock() {
    const text = I18N.notify_me_when_available;
    const href = this.product.back_in_stock_url;
    return `<a
        id="product-status-back-in-stock"
        href="${href}"
        class="button button--style button--secondary product-message__button"
        title="${text}"
        target="_blank"
      >
        <i class="theme-icon ph ph-warning-circle"></i>
        ${text}
      </a>`;
  }

  #getStatusContact() {
    const text = I18N.contact_us;
    return `<a
        id="product-status-contact"
        href="${this.data.info.contact.url}"
        class="button button--style button--secondary product-message__button"
        title="${text}"
        target="_blank"
      >
        <i class="theme-icon ph ph-envelope-simple"></i>
        ${text}
      </a>`;
  }

  #getStatusWhatsapp() {
    if (this.data.info.social.whatsapp.url === "") return;

    const text = "WhatsApp";
    const text_info = I18N.more_info;
    const share_url = this.product.share_url;

    return `<a
        id="product-status-whatsapp"
        href="${this.data.info.social.whatsapp.url}&text=${text_info}%20${share_url}"
        class="button button--style button--whatsapp product-message__button"
        title="${text}"
        target="_blank"
      >
        <i class="theme-icon ph ph-whatsapp-logo"></i>
        ${text}
      </a>`;
  }

  #getDisableShoppingFeaturesSection() {
    return `<div class="product-message" id="product-status-shopping-disabled">
        <div class="product-message__title check-empty">${this.options.disableShoppingCartTitle}</div>
        <div class="product-message__text check-empty">${this.options.disableShoppingCartText}</div>
        <div class="product-message__buttons check-empty">
        ${this.options.disableShoppingCartContact === true ? this.#getStatusContact() : ""}
        ${this.options.disableShoppingCartWhatsapp === true ? this.#getStatusWhatsapp() : ""}
        </div>
      </div>`;
  }

  #getOutOfStockSection() {
    let backInStockPart = "";
    if (this.product.back_in_stock_enabled && this.product.back_in_stock_url !== "")
      backInStockPart = this.#getStatusBackInStock();
    else if (this.status.buttonContact) backInStockPart = this.#getStatusContact();

    return `<div class="product-message" id="product-status-out-of-stock">
        <div class="product-message__title check-empty">${this.status.outOfStockTitle}</div>
        <div class="product-message__text check-empty">${this.status.outOfStockText}</div>
         <div class="product-message__buttons check-empty">
        ${backInStockPart}
        ${this.status.buttonWhatsapp ? this.#getStatusWhatsapp() : ""}
        </div>
      </div>`;
  }

  #getNotAvailableSection() {
    return `<div class="product-message" id="product-status-not-available">
        <div class="product-message__title check-empty">${this.status.notAvailableTitle}</div>
        <div class="product-message__text check-empty">${this.status.notAvailableText}</div>
        <div class="product-message__buttons check-empty">
        ${this.status.buttonContact ? this.#getStatusContact() : ""}
        ${this.status.buttonWhatsapp ? this.#getStatusWhatsapp() : ""}
        </div>
      </div>`;
  }
}
window.customElements.define("product-form", ProductForm);

class ProductPrice extends CustomHTMLElement {
  constructor() {
    super();
  }

  initialize() {
    this.buildProductPrice();
  }

  buildProductPrice(variantId) {
    this.script = this.querySelector(`script.product-price-json`);
    this.data = JSON.parse(this.script.textContent);
    this.options = this.data.options;
    this.variantId = variantId ? +variantId : +this.getAttribute("data-productid");
    this.product =
      this.data.info.variants.length === 0
        ? this.data.info.product
        : this.data.info.variants.find((x) => x.id === this.variantId);

    Array.from(this.children).forEach((child) => {
      if (child.tagName.toLowerCase() !== "script") child.remove(); // remove all previous children
    });

    if (this.options.disablePrices) return;

    const elements = [
      { tag: "span", className: "product-page__price" },
      { tag: "span", className: "product-page__price product-page__price--new" },
      { tag: "span", className: "product-page__price product-page__price--old" },
      { tag: "span", className: "product-page__price--tax-label" },
      { tag: "span", className: "product-page__discount-label" },
      { tag: "div", className: "product-page__discount-message" },
      { tag: "div", className: "product-page__price--without-tax" },
      { tag: "div", className: "product-page__price--lowest-recent-price" },
    ];

    const [
      productNormalPrice,
      productNewPrice,
      productOldPrice,
      priceTaxLabel,
      productDiscountBadge,
      productDiscountMessage,
      productPriceWithoutTax,
      productLowestRecentPrice,
    ] = elements.map(({ tag, className }) => {
      const element = document.createElement(tag);
      element.className = className;
      this.appendChild(element);
      return element;
    });

    if (this.product.discount > 0) {
      this.price = this.product.price - this.product.discount;
      productNormalPrice.classList.add("hidden");
      productNewPrice.classList.remove("hidden");
      productOldPrice.classList.remove("hidden");
      productNewPrice.textContent = this.product.price_with_discount_formatted;
      productOldPrice.textContent = this.product.price_formatted;

      if (this.options.showDiscountBadge != "none") {
        productDiscountBadge.classList.remove("hidden");
        productDiscountBadge.classList.add(`product-page__discount-label--${this.options.showDiscountBadgeShape}`);
        if (this.options.showDiscountBadge == "both") {
          productDiscountBadge.textContent = `-${this.product.percentage_off}% ${this.options.showDiscountBadgeText}`;
        } else if (this.options.showDiscountBadge == "percentage") {
          productDiscountBadge.textContent = `-${this.product.percentage_off}%`;
        } else if (this.options.showDiscountBadge == "text") {
          productDiscountBadge.textContent = `${this.options.showDiscountBadgeText}`;
        }
      } else productDiscountBadge.classList.add("hidden");

      if (this.options.showDiscountMessage && this.product.discount_begins && this.product.discount_expires) {
        productDiscountMessage.classList.remove("hidden");
        productDiscountMessage.textContent = formatTranslation(I18N.discount_message, {
          date_begins: this.product.date_begins,
          date_expires: this.product.date_expires,
        });
      } else productDiscountMessage.classList.add("hidden");
    } else {
      productNormalPrice.classList.remove("hidden");
      productNewPrice.classList.add("hidden");
      productOldPrice.classList.add("hidden");
      productDiscountBadge.classList.add("hidden");
      productDiscountMessage.classList.add("hidden");
      productNormalPrice.textContent = this.product.price_formatted;
      this.price = this.product.price;
    }

    if (this.options.showPriceWithoutTax && this.product.price_tax > 0) {
      productPriceWithoutTax.classList.remove("hidden");
      productPriceWithoutTax.textContent = `${OPTIONS.price_without_tax_message} ${this.product.price_without_tax_formatted}`;
    } else {
      productPriceWithoutTax.classList.add("hidden");
    }

    if (this.options.showTaxLabel) {
      priceTaxLabel.classList.remove("hidden");
      priceTaxLabel.textContent = OPTIONS.tax_label;
    } else priceTaxLabel.classList.add("hidden");

    if (this.options.taxLabelUppercase) {
      priceTaxLabel.classList.add("uppercase");
    } else priceTaxLabel.classList.remove("uppercase");

    if (this.options.showLowestRecentPrice && this.product.discount > 0) {
      productLowestRecentPrice.classList.remove("hidden");
      productLowestRecentPrice.textContent = `${I18N.lowest_price_message} ${this.product.lowest_price_formatted}`;
    } else {
      productLowestRecentPrice.classList.add("hidden");
    }
    (window.storeInfo ||= {}).product = {
      ...this.product,
      price_with_discount: this.price,
    };
  }
}
window.customElements.define("product-price", ProductPrice);

class ProductAppointments extends HTMLElement {
  static dependencies = {
    css: {
      url: "https://cdnjs.cloudflare.com/ajax/libs/flatpickr/4.6.13/flatpickr.min.css",
      integrity: "sha512-MQXduO8IQnJVq1qmySpN87QQkiR1bZHtorbJBD0tzy7/0U9+YIC93QWHeGTEoojMVHWWNkoCp8V6OzVSYrX0oQ==",
    },
    script: {
      url: "https://cdnjs.cloudflare.com/ajax/libs/flatpickr/4.6.13/flatpickr.min.js",
      integrity: "sha512-K/oyQtMXpxI4+K0W7H25UopjM8pzq0yrVdFdG21Fh5dBe91I40pDd9A4lzNlHPHBIP2cwZuoxaUSX0GJSObvGA==",
      async: false,
    },
  };

  static assetsPromise = null;

  static async ensureAssets() {
    await ensureStylesheetAsset(this.dependencies.css);

    if (window.flatpickr) return;

    if (!this.assetsPromise) {
      this.assetsPromise = ensureScriptAsset(this.dependencies.script);
    }

    await this.assetsPromise;
  }

  constructor() {
    super();
  }

  connectedCallback() {
    this.script = this.querySelector(`script.product-appointments-json`);
    this.data = JSON.parse(this.script.textContent);

    if (this.data.info.availability === "specific_dates") {
      this.initSpecificAppointment();
    } else {
      this.initRecurringAppointment();
    }
  }

  initSpecificAppointment() {
    this.timeslots = this.data.info.specific_dates_timeslots ?? [];

    if (this.timeslots.length <= 0) {
      this.isValidSelection = false;
      this.pollShoppingAvailability();
    } else {
      const select = this.querySelector("select[name='specific-dates-timeslots']");
      select.addEventListener("change", this.onChangeSpecificDate);
      this.onChangeSpecificDate({ target: select }); // select 1st option by default
    }
  }

  initRecurringAppointment() {
    this.calendarId = this.id;
    const disabledAttr = this.getAttribute("disabled-dates");
    this.disabledWeekDays = disabledAttr ? disabledAttr.split(",").map((str) => parseInt(str.trim())) : [];

    const blockedAttr = this.getAttribute("blocked-dates");
    this.blockedDates = blockedAttr ? blockedAttr.split(",").map((str) => str.trim()) : [];

    this.firstDate = this.getAttribute("first-date") || this.#formatDate(new Date());
    this.lastDate = this.getAttribute("last-date") || null;
    this.optionId = this.getAttribute("data-optionid");
    this.selectedDate = null;
    this.selectedTimeslot = null;
    this.isValidSelection = false;
    this.lastRequestedDate = null;
    this.availableTimeslotsMap = {};

    $("#input-qty").on("change", this.#onCartQuantityChange);
    this.setupFlatpickrCalendar();
    this.buildAppointments();
  }

  disconnectedCallback() {
    $("#input-qty").off("change", this.#onCartQuantityChange);
    this.querySelector("select[name='specific-dates-timeslots']")?.removeEventListener(
      "change",
      this.onChangeSpecificDate,
    );
  }

  onChangeSpecificDate({ target }) {
    if (!target) return;

    const option = target.selectedOptions[0];
    const { start_datetime, end_datetime, remaining } = option.dataset;

    document.querySelector("input[name='start_time'].prod-appointments").value = start_datetime;
    document.querySelector("input[name='end_time'].prod-appointments").value = end_datetime;

    const slotsLeft = remaining !== "" && !Number.isNaN(Number(remaining)) ? Number(remaining) : null;

    if (slotsLeft != null) {
      const remainingCapacityElem = document.getElementById("product-appointments__capacity-remaining");
      remainingCapacityElem.textContent = slotsLeft;

      const productFormInput = document.getElementById("input-qty");
      productFormInput.setAttribute("max", slotsLeft);
      updateProductFormCounter(this, 0);
    }
  }

  async setupFlatpickrCalendar() {
    try {
      await ProductAppointments.ensureAssets();
    } catch (error) {
      console.error("Flatpickr assets failed to load", error);
      return;
    }

    if (typeof flatpickr === "undefined") {
      console.error("Flatpickr is not available after loading assets");
      return;
    }

    const userLang = (navigator.language || "en").slice(0, 2);
    if (userLang !== "en") {
      try {
        await import(`https://cdn.jsdelivr.net/npm/flatpickr@4.6.13/dist/l10n/${userLang}.js`);
      } catch (e) {
        console.warn(`Language "${userLang}" is not supported. Using English.`, e);
      }
    }

    const calendarTarget = this.querySelector(".product-appointments__calendar");
    if (!calendarTarget) {
      console.warn("No calendar element with '.product-appointments__calendar' found");
      return;
    }

    const wrapper = document.createElement("div");
    calendarTarget.appendChild(wrapper);

    const rangeStart = this.firstDate;
    const rangeEnd = this.lastDate || this.#getNDaysFromNowDateStr(this.firstDate, 30);
    this.availableTimeslotsMap = await getAvailableTimeslotsInRange(this.data.info.product_id, rangeStart, rangeEnd);
    const unavailableDates = Object.entries(this.availableTimeslotsMap).reduce(
      (acc, [date, appointments]) => (appointments.length ? acc : [...acc, date]),
      [],
    );

    this.flatpickr = flatpickr(wrapper, {
      inline: true,
      dateFormat: "Y-m-d",
      minDate: this.firstDate,
      maxDate: this.lastDate,
      locale: userLang,
      disable: [
        ...unavailableDates,
        ...this.blockedDates,
        ...(this.disabledWeekDays.length > 0 ? [(date) => this.disabledWeekDays.includes(date.getDay())] : []),
      ],

      prevArrow: '<span><i class="theme-icon ph ph-caret-left"></i></span>',
      nextArrow: '<span><i class="theme-icon ph ph-caret-right"></i></span>',

      onChange: (selectedDates, dateStr, _instance) => {
        this.selectedDate = selectedDates[0];
        this.formattedDate = dateStr;
        this.hasSelectedCalendarDay = true;
        this.selectedTimeslot = null;
        this.isValidSelection = false;
        this.querySelector(".product-appointments__slots--full").removeAttribute("disabled");
        this.buildAppointments();
      },
      onReady: (_selectedDates, dateStr, instance) => {
        this.formattedDate = dateStr;
        const up = instance.calendarContainer.querySelector(".numInputWrapper .arrowUp");
        if (up) up.innerHTML = '<i class="theme-icon ph ph-caret-up"></i>';
        const down = instance.calendarContainer.querySelector(".numInputWrapper .arrowDown");
        if (down) down.innerHTML = '<i class="theme-icon ph ph-caret-down"></i>';
      },
    });
  }

  buildTimeslot(timeslot, index, cartQuantity) {
    const hasCapacity = timeslot.capacity != null;

    const input = document.createElement("input");
    input.type = "radio";
    input.name = this.availableTimeslotsElement.getAttribute("data-optionid") || "timeslot";
    input.value = index;
    input.id = `timeslot_${index}_${Date.now()}`;
    input.disabled = hasCapacity && cartQuantity > timeslot.remaining;
    input._timeslotData = timeslot;
    input.addEventListener("click", this.#onTimeslotClick);

    const isSelected =
      this.selectedTimeslot?.start_time === timeslot.start_time &&
      this.selectedTimeslot?.end_time === timeslot.end_time;

    const label = document.createElement("label");
    label.className = `button product-options__selector product-options__selector--button ${isSelected ? "selected" : ""}`;
    label.appendChild(input);

    const timeSpan = document.createElement("span");
    timeSpan.textContent = `${timeslot.start_time} - ${timeslot.end_time}`;
    label.appendChild(timeSpan);

    if (hasCapacity) {
      const capacitySpan = document.createElement("span");
      capacitySpan.className = "product-options__selector--left";
      capacitySpan.textContent = `${timeslot.remaining} ${I18N.appointment_capacity_left || "left"}`;
      label.appendChild(capacitySpan);
    }

    this.availableTimeslotsElement.appendChild(label);
  }

  async buildAppointments(cartQuantity) {
    if (!cartQuantity) cartQuantity = document.querySelector("#input-qty").valueAsNumber;

    this.script = this.querySelector(`script.product-appointments-json`);
    this.data = JSON.parse(this.script.textContent);

    this.appointmentStartDateInput = this.querySelector("input[name='start_time'].prod-appointments");
    this.appointmentEndDateInput = this.querySelector("input[name='end_time'].prod-appointments");

    this.availableTimeslotsElement = this.querySelector(".available-timeslots");
    if (!this.availableTimeslotsElement) return;

    let timeslots = this.availableTimeslotsMap[this.formattedDate];

    if (!timeslots) {
      this.availableTimeslotsElement.innerHTML = this.#loadingSpinnerHtml();
      timeslots = await getAvailableTimeslotsSingleDate(this.data.info.product_id, this.formattedDate);
      this.availableTimeslotsMap[this.formattedDate] = timeslots;
    }

    // no timeslots available for this date
    if (!timeslots || timeslots.length === 0) {
      this.availableTimeslotsElement.innerHTML = `
        <div class="product-message w-100 d-flex justify-content-center align-items-center" style="min-height: 180px;">
          <small><strong>${this?.data?.status?.noTimeslotsForDate || "No timeslots available"}</strong></small>
        </div>
      `;

      this.pollShoppingAvailability();
      return;
    }

    this.availableTimeslotsElement.innerHTML = "";
    timeslots.forEach((timeslot, index) => this.buildTimeslot(timeslot, index, cartQuantity));

    this.pollShoppingAvailability();
  }

  #onTimeslotClick = (event) => {
    const inputElement = event.currentTarget;
    this.selectedTimeslot = inputElement._timeslotData;

    if (this.hasSelectedCalendarDay) {
      this.isValidSelection = true;
      this.appointmentStartDateInput.value = `${this.formattedDate} ${this.selectedTimeslot.start_time}`;
      this.appointmentEndDateInput.value = `${this.formattedDate} ${this.selectedTimeslot.end_time}`;
    }

    const hasCapacity = this.selectedTimeslot.capacity != null;
    if (hasCapacity) {
      const productFormInput = document.getElementById("input-qty");
      productFormInput.setAttribute("max", this.selectedTimeslot.remaining);
      updateProductFormCounter(this, 0);
    }

    this.pollShoppingAvailability();
  };

  #onCartQuantityChange = (event) => {
    const qty = event.currentTarget.valueAsNumber;
    this.buildAppointments(qty);
  };

  pollShoppingAvailability() {
    const productForm = this.closest("product-form");
    if (!productForm) return;

    if (this.isValidSelection) {
      productForm.enableAddToCartAndBuyNow();
    } else {
      const addToCartButton = productForm.querySelector("#add-to-cart");
      if (addToCartButton) addToCartButton.querySelector("span").textContent = I18N.choose_a_time_slot;
      productForm.disableAddToCartAndBuyNow();
    }
  }

  #formatDate(date) {
    return new Date(date).toISOString().split("T")[0];
  }

  #loadingSpinnerHtml() {
    return `<div class="w-100 p-2 d-flex justify-content-center align-items-center" style="min-height: 180px;">
      <div class="loading-spinner"></div>
    </div>`;
  }

  #getNDaysFromNowDateStr(dateStr, N) {
    const baseDate = new Date(dateStr);
    if (isNaN(baseDate.getTime())) throw new Error("Invalid date provided");
    const futureDate = new Date(baseDate);
    futureDate.setDate(futureDate.getDate() + N);
    return futureDate.toISOString().split("T")[0]; // YYYY-MM-DD format
  }
}
window.customElements.define("product-appointments", ProductAppointments);

class ProductPriceVolumes extends CustomHTMLElement {
  constructor() {
    super();
  }

  initialize() {
    this.buildProductPriceVolumes();
  }

  disconnectedCallback() {
    this.qtyButtons?.forEach((button) => button.removeEventListener("click", this.#refreshSelectedRow));
  }

  buildProductPriceVolumes(variantId) {
    this.script = this.querySelector(`script.product-volume-prices-json`);
    this.data = JSON.parse(this.script.textContent);
    this.options = this.data.options;
    this.variantId = variantId ? +variantId : +this.getAttribute("data-productid");
    this.product =
      this.data.info.variants.length === 0
        ? this.data.info.product
        : this.data.info.variants.find((x) => x.id === this.variantId);
    this.minIntervals = [1, ...this.product.volume_prices.map((v) => v.min)];

    Array.from(this.children).forEach((child) => {
      if (child.tagName.toLowerCase() !== "script") child.remove(); // remove all previous children
    });

    this.classList.remove("hidden");

    if (this.options.disablePrices || (this.options.hideWhenLengthOne && this.product.volume_prices.length === 0)) {
      this.classList.add("hidden");
      return;
    }

    this.insertAdjacentHTML("beforeend", this.#getTableHtml());
    this.refreshSelectedRowListener();
  }

  refreshSelectedRowListener() {
    this.productPageInfo = this.closest(".product-page__info");
    if (!this.productPageInfo) return;

    this.inputQty = this.productPageInfo.querySelector(".product-form__input");
    this.qtyButtons = this.productPageInfo.querySelectorAll(".quantity-up, .quantity-down");
    if (this.qtyButtons.length === 0 || !this.inputQty) return;

    this.#refreshSelectedRow();
    this.qtyButtons.forEach((button) => button.addEventListener("click", this.#refreshSelectedRow));
  }

  #refreshSelectedRow = () => {
    this.quantitySelected = +this.inputQty.value;
    this.selectedRowIndex = this.#getSelectedRowIndex();
    if (this.selectedRowIndex !== -1) {
      this.#deselectAllRows();

      const activeRow = this.querySelector(`.product-volume-prices__row:nth-of-type(${this.selectedRowIndex})`);
      if (activeRow) activeRow.classList.add("product-volume-prices__row--active");
    }
  };

  #deselectAllRows() {
    this.querySelectorAll(".product-volume-prices__row").forEach((row) => {
      row.classList.remove("product-volume-prices__row--active");
    });
  }

  #getSelectedRowIndex() {
    const rowIdx = this.minIntervals.findIndex((x, idx) => {
      const nextInterval = this.minIntervals[idx + 1];
      if (nextInterval === undefined) return x <= this.quantitySelected;
      return x <= this.quantitySelected && this.quantitySelected < nextInterval;
    });

    return rowIdx === -1 ? -1 : rowIdx + (this.options.hideBuy1Row ? 1 : 2);
  }

  #getTableHtml() {
    return `
      <div class="product-volume-prices__row">
        <div class="product-volume-prices__entry">${I18N.minimum_quantity}</div>
        <div class="product-volume-prices__entry">${I18N.active_price}</div>
        ${this.options.showDiscountColumn ? `<div class="product-volume-prices__entry">${I18N.discount_off}</div>` : ""}
      </div>
      ${this.#getBuy1RowHtml()}
      ${this.#getVolumePricesRowsHtml()}
    `;
  }

  #getBuy1RowHtml() {
    if (this.options.hideBuy1Row) return "";
    const showPlus = this.minIntervals.length === 1 ? true : this.minIntervals[1] > 2;

    return `<div class="product-volume-prices__row">
        <div class="product-volume-prices__entry">${I18N.buy} 1${showPlus ? "+" : ""}</div>
        <div class="product-volume-prices__entry">
          <span class="product-page__price--new product-volume-prices__price--main">${this.product.price_with_discount_formatted}</span>
          <span class="product-page__price--old product-volume-prices__price--main">${this.product.price_formatted !== this.product.price_with_discount_formatted ? this.product.price_formatted : ""}</span>
        </div>
         ${
           this.options.showDiscountColumn
             ? `
        <div class="product-volume-prices__entry">
          <span class="product-page__price--new product-volume-prices__price--main">${this.product.percentage_off != 0 ? `${this.product.percentage_off}%` : "-"}</span>
        </div>`
             : ""
         }
      </div>`;
  }

  #getVolumePricesRowsHtml() {
    return this.product.volume_prices
      .map((v, vIdx) => {
        const activePrice = v.price;
        const originalPrice = this.product.price;
        const percentageOff = this.#calculatePercentageOff(originalPrice, activePrice);

        const nextMin = this.minIntervals[vIdx + 2];
        const showPlus = nextMin ? nextMin - v.min > 1 : true;

        return `<div class="product-volume-prices__row">
        <div class="product-volume-prices__entry">${I18N.buy} ${v.min}${showPlus ? "+" : ""}</div>
        <div class="product-volume-prices__entry">
          <span class="product-page__price--new">${v.price_formatted}</span>
          <span class="product-page__price--old">${this.product.price_formatted}</span>
        </div>
        ${
          this.options.showDiscountColumn
            ? `
        <div class="product-volume-prices__entry">
          <span class="product-page__price--new">${percentageOff}%</span>
        </div>`
            : ""
        }
      </div>`;
      })
      .join("");
  }

  #calculatePercentageOff(originalPrice, activePrice) {
    const value = originalPrice ? (originalPrice - activePrice) / originalPrice : 0;
    return value > 0 ? parseFloat(value * 100).toFixed(0) : 0;
  }
}
window.customElements.define("product-volume-prices", ProductPriceVolumes);

class ProductAttributes extends CustomHTMLElement {
  constructor() {
    super();
  }

  initialize() {
    this.buildProductAttributes();
  }

  hide() {
    this.classList.add("hidden");
  }

  show() {
    this.classList.remove("hidden");
  }

  buildProductAttributes(variant) {
    this.script = this.querySelector(`script.product-attributes-json`);
    this.data = JSON.parse(this.script.textContent);
    this.options = this.data.options;
    this.sku = typeof variant === "undefined" || variant === null ? this.data.info.variant.sku : variant.sku;
    this.brand = this.data.info.variant.brand;

    const sku = this.querySelector(".product-page__sku");
    const brand = this.querySelector(".product-page__brand");
    const divider = this.querySelector(".product-page__attributes--divider");

    if ((!this.brand && !this.sku) || (!this.options.showBrand && !this.options.showSku)) {
      this.hide();
      return;
    } else this.show();

    if (this.options.showBrand && this.brand && this.options.showSku && this.sku) divider.classList.remove("hidden");
    else divider.classList.add("hidden");

    if (this.options.showSku) {
      if (!this.sku) sku.classList.add("hidden");
      else {
        sku.classList.remove("hidden");
        sku.textContent = `${this.options.showSkuText ? `${I18N.SKU}: ` : ""}${this.sku}`;
      }
    } else sku.classList.add("hidden");

    if (this.options.showBrand) {
      if (!this.brand) brand.classList.add("hidden");
      else {
        brand.classList.remove("hidden");
        brand.textContent = this.brand;
      }
    } else brand.classList.add("hidden");
  }
}
window.customElements.define("product-attributes", ProductAttributes);

class CartArea extends CustomHTMLElement {
  constructor() {
    super();
    this.isLoading = false;
    this.placeholderImg = `//assets.jumpseller.com/public/placeholder/themes/base/placeholder-image-product-thumb.jpg`;
  }

  async initialize() {
    this.setupEventHandlers();
  }

  setIsLoading(value) {
    if (this.isLoading === value) return;
    this.isLoading = value;
    this.classList.toggle("disabled", value);
    document.querySelector(".store-totals").classList.toggle("disabled", value);
  }

  setupEventHandlers() {
    $("#clear-cart").on("click", async () => {
      Jumpseller.clearCart();
      await refreshCartDisplay();
    });
    const cartItems = this.querySelectorAll(".store-product");
    cartItems.forEach((cartItem) => {
      const cartItemId = cartItem.getAttribute("data-id");
      const $item = $(cartItem);
      const $deleteButton = $item.find(".store-product__delete");
      const $minusButton = $item.find(".store-product__handler--minus");
      const $plusButton = $item.find(".store-product__handler--plus");
      const $qtyInput = $item.find(".store-product__input");
      const minimumToBuy = parseFloat($qtyInput.attr("min")) || 1;

      const onError = (oldQty) => {
        $qtyInput.val(oldQty);
      };

      $deleteButton.off("click").on("click", () => {
        this.updateCartData(cartItemId, 0, null);
      });

      $minusButton.off("click").on("click", () => {
        if (this.isLoading) return;
        const currentQty = parseInt($qtyInput.val(), 10);
        if (currentQty === minimumToBuy) {
          this.updateCartData(cartItemId, 0, null);
          return;
        } else if (currentQty < minimumToBuy) return;

        const newQty = currentQty - 1;
        this.updateCartData(cartItemId, newQty, currentQty, null, onError);
      });

      let debounceTimer;

      $qtyInput.off("input change").on("input change", () => {
        clearTimeout(debounceTimer);

        debounceTimer = setTimeout(() => {
          if (this.isLoading) return;
          const newQty = parseInt($qtyInput.val(), 10);
          const currentQty = parseInt($qtyInput.data("current"), 10);
          if (isNaN(newQty) || newQty < minimumToBuy) return $qtyInput.val(currentQty);
          if (newQty === currentQty) return;
          this.updateCartData(cartItemId, newQty, currentQty, null, onError);
        }, 500);
      });

      $plusButton.off("click").on("click", () => {
        if (this.isLoading) return;
        const currentQty = parseInt($qtyInput.val(), 10);
        const newQty = currentQty + 1;
        this.updateCartData(cartItemId, newQty, currentQty, null, onError);
      });
    });

    $(".store-totals__column[data-name='coupons'] .store-totals__code").each(function () {
      $(this)
        .find(".store-totals__remove")
        .on("click", async () => {
          Jumpseller.removeCouponFromCart($(this).data("value"), 0);
          await refreshCartDisplay();
        });
    });
  }

  updateCartData(cartItemId, newQty, prevQty, onSuccess, onError) {
    if (this.isLoading) return;

    const debounceKey = +cartItemId;
    const handles = (window.cartDebounceHandles = window.cartDebounceHandles || {});
    const handle = (handles[debounceKey] = handles[debounceKey] || { qty: prevQty });

    clearTimeout(handle.handle);
    handle.handle = setTimeout(() => {
      const oldQty = handle.qty;
      delete handles[debounceKey];

      this.setIsLoading(true);
      Jumpseller.updateCart(cartItemId, newQty, {
        callback: async (data) => {
          this.setIsLoading(false);
          if (data.status && data.status !== 200) {
            if (onError) onError(oldQty);
            new ToastNotification({
              type: "error",
              title: I18N.error_updating_to_cart,
              message: data.responseJSON.message,
            });
            return;
          }
          if (onSuccess) onSuccess();
          await refreshCartDisplay();
        },
      });
    }, window.theme.cart.debounce);
  }
}
window.customElements.define("cart-area", CartArea);

class ProductBlockSwatch extends CustomHTMLElement {
  constructor() {
    super();
  }

  initialize() {
    this.querySelectorAll("button.product-block__color").forEach((element) =>
      element.addEventListener("click", this.#changeImageOnColorChange),
    );
  }

  disconnectedCallback() {
    this.querySelectorAll("button.product-block__color").forEach((element) =>
      element.removeEventListener("click", this.#changeImageOnColorChange),
    );
  }

  #changeImageOnColorChange(event) {
    const element = event.currentTarget;
    const productBlock = element.closest(".product-block");
    productBlock
      .querySelectorAll(".product-block__color")
      .forEach((item) => item.classList.toggle("product-block__color--active", item === element));

    const image = productBlock.querySelector(".product-block__image");
    const newSrc = element.dataset.image;
    const newSrcset = element.dataset.srcset;

    if (!newSrc) return;

    image.removeAttribute("srcset");
    image.src = newSrc;

    if (newSrcset) {
      image.srcset = newSrcset;
    }
  }
}
window.customElements.define("product-block-swatch", ProductBlockSwatch);

class ProductWishlist extends CustomHTMLElement {
  constructor() {
    super();
  }

  initialize() {
    this.buildWishlist();
  }

  buildWishlist(variantId) {
    this.data = JSON.parse(this.querySelector(`script.product-wishlist-json`).textContent).info;

    this.has_variants = this.data.product.has_variants;
    if (this.has_variants) {
      this.updateIcon(false);
      this.#buildWishlistRedirect();
      return;
    }

    this.product = this.data.product;
    this.variants = this.variants ? this.variants : this.product.variants;
    this.customer = this.data.customer;
    this.productId = this.product.id;
    this.variantId =
      typeof variantId === "undefined" || variantId === null ? this.data.product.first_variant_id : variantId;

    const wishlisted = this.variants
      ? this.variants.find((variant) => variant.variant_id === this.variantId).wishlisted
      : this.product.wishlisted_product;

    this.updateIcon(wishlisted);
    this.#changeWishlistURL(this.product, this.variantId);
  }

  updateIcon(wishlisted) {
    if (!wishlisted) {
      $(`.add-to-wishlist${this.productId}`).removeClass("hidden");
      $(`.remove-from-wishlist${this.productId}`).addClass("hidden");
    } else {
      $(`.add-to-wishlist${this.productId}`).addClass("hidden");
      $(`.remove-from-wishlist${this.productId}`).removeClass("hidden");
    }
  }

  #changeWishlistURL(product, variantId) {
    const addWishlistUrl = product.wishlist_add_url + (variantId === null ? "" : `?variant_id=${variantId}`);
    $(`.add-to-wishlist${this.productId}`, this).attr("onclick", `addToWishlist(this,"${addWishlistUrl}")`);
    const removeWishlistUrl = product.wishlist_remove_url + (variantId === null ? "" : `?variant_id=${variantId}`);
    $(`.remove-from-wishlist${this.productId}`, this).attr(
      "onclick",
      `removeFromWishlist(this,"${removeWishlistUrl}")`,
    );
  }

  #buildWishlistRedirect() {
    const url = this.data.product.url;
    this.querySelector(`.product-wishlist__button`).setAttribute("onclick", `location.href='${url}'`);
  }
}
window.customElements.define("product-wishlist", ProductWishlist);

class ToastNotification {
  constructor(options = {}) {
    this.message = options.message || "No notification message provided";
    this.type = options.type || "default";
    this.title = options.title || "";
    this.duration = options.duration || 4000;
    this.overtime = options.overtime || 1500;
    this.onclick = options.onclick || null;
    this.closeButton = options.closeButton ?? true;
    this.progressBar = options.progressBar ?? true;

    this.element = null;
    this.timeoutId = null;
    this.wrapper = document.querySelector(".toast-notification__wrapper");
    this.create();
  }

  create() {
    this.element = document.createElement("div");
    this.element.className = `toast-notification toast-notification--${this.type}`;
    this.element.innerHTML = `
      <div class="toast-notification__content">
        ${this.title ? `<div class="toast-notification__title">${this.title}</div>` : ""}
        <div class="toast-notification__message">${this.message}</div>
      </div>
      ${this.closeButton ? `<button class="toast-notification__close"><i class="ph ph-x"></i></button>` : ""}
      ${this.progressBar ? `<div class="toast-notification__progress"></div>` : ""}
    `;

    this.wrapper.appendChild(this.element);

    if (this.closeButton) {
      this.element.querySelector(".toast-notification__close").addEventListener("click", this.close);
    }

    if (this.onclick) {
      this.element.classList.add("toast-notification--clickable");
      this.element.addEventListener("click", this.onclick);
    }

    this.element.addEventListener("mouseenter", this.pauseAutoClose);
    this.element.addEventListener("mouseleave", this.resumeAutoClose);

    requestAnimationFrame(() => {
      this.element.classList.add("toast-notification--enter");
      if (this.progressBar) this.startProgressBar();
    });

    this.autoClose();
  }

  startProgressBar() {
    const progressBar = this.element.querySelector(".toast-notification__progress");
    progressBar.style.transition = "none";
    progressBar.style.width = "100%";

    requestAnimationFrame(() => {
      progressBar.style.transition = `width ${this.duration}ms linear`;
      progressBar.style.width = "0%";
    });
  }

  resetProgressBar() {
    const progressBar = this.element.querySelector(".toast-notification__progress");
    progressBar.style.transition = "none";
    progressBar.style.width = "100%";

    requestAnimationFrame(() => {
      progressBar.style.transition = `width ${this.overtime}ms linear`;
      progressBar.style.width = "0%";
    });
  }

  autoClose() {
    this.timeoutId = setTimeout(this.close, this.duration);
  }

  pauseAutoClose = () => {
    clearTimeout(this.timeoutId);
    const progressBar = this.element.querySelector(".toast-notification__progress");
    if (progressBar) {
      progressBar.style.transition = "none";
    }
  };

  resumeAutoClose = () => {
    if (this.progressBar) this.resetProgressBar();
    this.timeoutId = setTimeout(this.close, this.overtime);
  };

  close = (event) => {
    if (event) event.stopPropagation();
    clearTimeout(this.timeoutId);

    if (this.onclick) this.element.removeEventListener("click", this.onclick);
    if (this.close) this.element.removeEventListener("click", this.close);
    this.element.removeEventListener("mouseenter", this.pauseAutoClose);
    this.element.removeEventListener("mouseleave", this.resumeAutoClose);

    this.element.classList.remove("toast-notification--enter");
    this.element.classList.add("toast-notification--exit");
    this.element.addEventListener("animationend", () => this.element.remove(), { once: true });
  };
}

class StoreCounter extends CustomHTMLElement {
  constructor() {
    super();
    this.intervalId = null;
  }

  initialize() {
    this.countDownDate = new Date(this.getAttribute("counter")).getTime();
    this.timeZone = this.getAttribute("timezone") || "UTC";
    this.counterList = this.querySelector(".theme-counter__list") || this.createCounterList();
    this.startCounter();
  }

  show() {
    this.counterList.classList.remove("hidden");
  }

  hide() {
    this.counterList.classList.add("hidden");
  }

  createCounterList() {
    const counterList = document.createElement("div");
    counterList.classList.add("theme-counter__list");
    this.appendChild(counterList);
    return counterList;
  }

  startCounter() {
    this.updateCounter();
    this.intervalId = setInterval(() => this.updateCounter(), 1000);
  }

  updateCounter() {
    const now = new Date().toLocaleString("en-US", { timeZone: this.timeZone });
    const diff = this.countDownDate - new Date(now).getTime();

    this.show();
    if (diff <= 0) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.hide();
      return;
    }

    const counterWeeks = I18N.counter_text_weeks,
      counterDays = I18N.counter_text_days,
      counterHours = I18N.counter_text_hours,
      counterMinutes = I18N.counter_text_minutes,
      counterSeconds = I18N.counter_text_seconds;

    const timeUnits = [
      { label: `${counterWeeks}`, value: Math.floor(diff / (1000 * 60 * 60 * 24 * 7)) },
      { label: `${counterDays}`, value: Math.floor((diff / (1000 * 60 * 60 * 24)) % 7) },
      { label: `${counterHours}`, value: Math.floor((diff / (1000 * 60 * 60)) % 24) },
      { label: `${counterMinutes}`, value: Math.floor((diff / (1000 * 60)) % 60) },
      { label: `${counterSeconds}`, value: Math.floor((diff / 1000) % 60) },
    ];

    const nonZeroUnits = timeUnits.filter((unit) => unit.value > 0 || unit.label === counterSeconds);
    const format = nonZeroUnits
      .map(
        (unit) =>
          `<div class="col-auto theme-counter__item">${unit.value.toString().padStart(2, "0")}
            <small>${unit.label}</small>
          </div>`,
      )
      .join("");

    this.counterList.innerHTML = format;
    this.counterList.setAttribute("data-counter-size", nonZeroUnits.length);
  }
}
window.customElements.define("store-counter", StoreCounter);

class VideoPlayer extends CustomHTMLElement {
  static dependencies = {
    css: {
      url: "https://unpkg.com/video.js@8.19.1/dist/video-js.min.css",
      integrity: "sha384-6AcT+XQvdnzeeii0I81tb4TuvZL+xFj0s+kZmq+/lMKhBwOb/0AuFCAsLYWQUD+7",
    },
    scripts: [
      {
        url: "https://unpkg.com/video.js@8.19.1/dist/video.min.js",
        integrity: "sha384-dSos2U9lJa4q/eA1uHbcgd8sL3xt0K2WLxFrct2zd/ZqoMJIhfiIj9IXWZ4cdAtr",
        async: false,
      },
      {
        url: "https://cdn.jsdelivr.net/npm/videojs-youtube@3.0.1/dist/Youtube.min.js",
        integrity: "sha384-vOLaPd6nUReyIgR5TDrMPqrdQXrd7z4zE0stQlGgWmFDX0KK+kogJnS+qpM8OXil",
        async: false,
      },
    ],
  };

  static resourcesLoaded = false;

  constructor() {
    super();
    this.observer = null;
  }

  connectedCallback() {
    if (this.initialized) return;

    if ("IntersectionObserver" in window) {
      this.observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              this.lazyInitialize();
              this.observer.disconnect();
            }
          });
        },
        { rootMargin: "50px" },
      );
      this.observer.observe(this);
    } else {
      requestAnimationFrame(() => this.lazyInitialize());
    }
  }

  disconnectedCallback() {
    if (this.observer) this.observer.disconnect();
  }

  lazyInitialize() {
    if (this.initialized) return;
    this.initialized = true;
    this.initialize().catch((error) => console.error("VideoPlayer:", error));
  }

  async initialize() {
    if (!VideoPlayer.resourcesLoaded) {
      await this.loadDependencies();
      VideoPlayer.resourcesLoaded = true;
    }

    this.wrapper = this.querySelector(".video-player__wrapper");
    this.script = this.querySelector("script");
    this.data = JSON.parse(this.script.textContent);
    this.src = this.data.src;
    this.options = this.data.options;
    this.posterPlaceholder = "//vjs.zencdn.net/v/oceans.png";
    this.dataSetup = {
      fluid: true,
    };

    await this.waitForVideojsOrTimeout();
  }

  waitForVideojsOrTimeout(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const startTime = performance.now();

      const check = () => {
        if (window.videojs) {
          this.createVideoPlayer();
          resolve("videojs ready");
        } else if (performance.now() - startTime > timeoutMs) {
          reject(new Error("Timeout: videojs was not ready on time"));
        } else {
          requestAnimationFrame(check);
        }
      };

      check();
    });
  }

  async loadDependencies() {
    await ensureStylesheetAsset(VideoPlayer.dependencies.css);
    for (const script of VideoPlayer.dependencies.scripts) {
      await ensureScriptAsset(script);
    }
  }

  createVideoPlayer() {
    const video = document.createElement("video");
    video.classList.add("video-js", "vjs-themed");
    this.options.controls ? video.setAttribute("controls", "") : video.removeAttribute("controls");
    this.options.autoplay ? video.setAttribute("autoplay", "") : video.removeAttribute("autoplay");
    this.options.muted ? video.setAttribute("muted", "") : video.removeAttribute("muted");
    this.options.loop ? video.setAttribute("loop", "") : video.removeAttribute("loop");
    video.setAttribute("playsinline", "");
    video.preload = "auto";

    if (this.detectYoutubeUrl(this.src)) {
      const dataSetup = this.getYoutubeSetupData(this.src);
      video.setAttribute("data-setup", dataSetup);
      if (this.wrapper) this.wrapper.appendChild(video);
      if (this.options.autoplay) {
        const player = videojs(video);
        player.autoplay("muted");
      }
      return;
    }

    video.setAttribute("data-setup", JSON.stringify(this.dataSetup));

    const source = document.createElement("source");
    source.src = this.src;
    source.type = this.getVideoType(this.src);
    video.appendChild(source);

    if (this.wrapper) this.wrapper.appendChild(video);

    if (this.options.autoplay) {
      if (!video.muted) video.muted = true;
      video.play();
    }
  }

  detectYoutubeUrl(src) {
    return /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/.test(src);
  }

  getYoutubeSetupData(src) {
    const dataSetup = {
      ...this.dataSetup,
      techOrder: ["youtube"],
      sources: [{ type: "video/youtube", src: src }],
    };
    return JSON.stringify(dataSetup);
  }

  getVideoType(src) {
    const videoExtensions = {
      mp4: "video/mp4",
      webm: "video/webm",
      ogg: "video/ogg",
      mov: "video/quicktime",
      m3u8: "application/x-mpegURL",
      mpd: "application/dash+xml",
    };

    try {
      const url = new URL(src);
      const extensionMatch = src.match(/\.(\w+)(\?|$)/);
      if (extensionMatch) {
        const ext = extensionMatch[1].toLowerCase();
        if (videoExtensions[ext]) return videoExtensions[ext];
      }

      if (url.pathname.endsWith("/manifest")) return "application/dash+xml";
      else if (url.pathname.endsWith(".m3u8") || src.includes(".m3u8")) return "application/x-mpegURL";
    } catch (error) {
      console.warn(`Invalid video source. Check the video component theme configuration. Current source: '${src}'.`);
    }

    return videoExtensions.mp4;
  }
}
window.customElements.define("video-player", VideoPlayer);

class ThemeTabs extends CustomHTMLElement {
  constructor() {
    super();
  }

  initialize() {
    const id = this.getAttribute("data-id");
    const isWishlist = this.getAttribute("data-wishlist") === "true";
    const details = [...document.querySelectorAll(`#component-${id} details.theme-tabs__item`)];
    this.tabs = [...document.querySelectorAll(`#component-${id} .theme-tabs__tab`)];
    this.link = document.querySelector(`#component-${id} .theme-section__link`);

    details.forEach((d) => d.removeAttribute("open"));
    this.tabs.forEach((t) => t.setAttribute("aria-expanded", "false"));

    if (isWishlist) {
      const wishlistDetails = document.querySelector(`#component-${id} details#theme-tabs-wishlist`);
      const wishlistTab = document.querySelector(`#component-${id} #theme-tabs-wishlist .theme-tabs__tab`);

      if (wishlistDetails) wishlistDetails.setAttribute("open", "");
      if (wishlistTab) wishlistTab.setAttribute("aria-expanded", "true");
    } else {
      details[0]?.setAttribute("open", "");
      this.tabs[0]?.setAttribute("aria-expanded", "true");
    }

    callonDOMLoaded(() => {
      this.tabs.forEach((tab) => {
        tab.addEventListener("click", this.#handleClick);
        tab.addEventListener("keydown", this.#handleKeyDown);
      });
    });
  }

  disconnectedCallback() {
    this.tabs.forEach((tab) => {
      tab.removeEventListener("click", this.#handleClick);
      tab.removeEventListener("keydown", this.#handleKeyDown);
    });
  }

  #handleKeyDown = (event) => {
    if (event.keyCode !== 32 && event.keyCode !== 13) return;

    const currentTab = event.currentTarget;
    const parentDetails = currentTab.closest("details");
    if (!parentDetails?.hasAttribute("open")) return;

    event.preventDefault();
  };

  #handleClick = (event) => {
    const currentTab = event.currentTarget;
    const parentDetails = currentTab.closest("details");

    if (parentDetails?.hasAttribute("open")) {
      event.preventDefault();
    }

    this.tabs.forEach((t) => t.setAttribute("aria-expanded", "false"));
    currentTab.setAttribute("aria-expanded", "true");
    if (this.link) this.link.setAttribute("href", this.getAttribute("data-permalink"));
  };
}
window.customElements.define("theme-tabs", ThemeTabs);

class VideoBackground extends HTMLElement {
  constructor() {
    super();
    this.initialized = false;
    this.observer = null;
  }

  connectedCallback() {
    if ("IntersectionObserver" in window) {
      this.observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && !this.initialized) {
              this.initializeVideoBackground();
              this.observer.disconnect();
            }
          });
        },
        { rootMargin: "50px" },
      );
      this.observer.observe(this);
    } else {
      requestAnimationFrame(() => {
        this.initializeVideoBackground();
      });
    }
  }

  disconnectedCallback() {
    if (this.observer) this.observer.disconnect();
  }

  initializeVideoBackground() {
    if (this.initialized) return;
    this.initialized = true;

    const desktopSrc = this.getAttribute("data-desktop");
    const mobileSrc = this.getAttribute("data-mobile");

    if (!desktopSrc && !mobileSrc) return console.error("VideoBackground: Missing 'data-desktop' or 'data-mobile'.");

    const videoSrc =
      mobileSrc && desktopSrc ? (window.innerWidth <= 768 ? mobileSrc : desktopSrc) : mobileSrc || desktopSrc;

    const videoBackground = document.createElement("div");

    const videoTitle = this.getAttribute("data-video-title");

    if (this.className) videoBackground.className = this.className;

    videoBackground.setAttribute("data-vbg", videoSrc);
    videoBackground.setAttribute("data-vbg-mobile", "true");
    videoBackground.setAttribute("data-vbg-always-play", "true");
    if (videoTitle) {
      videoBackground.setAttribute("data-vbg-title", videoTitle);
    }

    this.initializeVideoLibrary(videoBackground);

    this.replaceWith(videoBackground);
  }

  initializeVideoLibrary(element) {
    if (typeof jQuery === "undefined" || typeof VideoBackgrounds === "undefined")
      return console.error("VideoBackground: initialize error.");

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        this.addToVideoFactory(element);
      });
    } else {
      this.addToVideoFactory(element);
    }
  }

  addToVideoFactory(element) {
    try {
      jQuery(() => {
        if (!window.videoBackgroundsFactory) {
          window.videoBackgroundsFactory = new VideoBackgrounds();
        }
        window.videoBackgroundsFactory.add(element);
      });
    } catch (error) {
      console.error("VideoBackground:", error);
    }
  }
}

window.customElements.define("video-background", VideoBackground);

class ImageComparison extends HTMLElement {
  constructor() {
    super();
    this.isDragging = false;
    this.startDragHandler = (event) => this.startDrag(event);
    this.onDragHandler = (event) => this.onDrag(event);
    this.stopDragHandler = () => this.stopDrag();
  }

  connectedCallback() {
    this.wrapper = this.querySelector(".image-comparison__wrapper");
    this.handler = this.querySelector(".image-comparison__handler");
    this.line = this.querySelector(".image-comparison__line");
    this.beforeImage = this.querySelector(".image-comparison__content--before");

    if (!this.wrapper || !this.handler || !this.beforeImage) return;

    this.addEventListeners();
  }

  disconnectedCallback() {
    this.removeEventListeners();
  }

  addEventListeners() {
    this.handler.addEventListener("mousedown", this.startDragHandler);
    this.handler.addEventListener("touchstart", this.startDragHandler, { passive: true });

    if (this.line) {
      this.line.addEventListener("mousedown", this.startDragHandler);
      this.line.addEventListener("touchstart", this.startDragHandler, { passive: true });
    }

    window.addEventListener("mousemove", this.onDragHandler);
    window.addEventListener("touchmove", this.onDragHandler, { passive: false });
    window.addEventListener("mouseup", this.stopDragHandler);
    window.addEventListener("touchend", this.stopDragHandler);
  }

  removeEventListeners() {
    if (!this.handler || !this.beforeImage || !this.wrapper) return;

    this.handler.removeEventListener("mousedown", this.startDragHandler);
    this.handler.removeEventListener("touchstart", this.startDragHandler);

    if (this.line) {
      this.line.removeEventListener("mousedown", this.startDragHandler);
      this.line.removeEventListener("touchstart", this.startDragHandler);
    }

    window.removeEventListener("mousemove", this.onDragHandler);
    window.removeEventListener("touchmove", this.onDragHandler);
    window.removeEventListener("mouseup", this.stopDragHandler);
    window.removeEventListener("touchend", this.stopDragHandler);
  }

  startDrag(event) {
    this.isDragging = true;
    this.handler.style.cursor = "grabbing";
    if (this.line) this.line.style.cursor = "grabbing";
    this.slide(event);
  }

  stopDrag() {
    this.isDragging = false;
    this.handler.style.cursor = "";
    if (this.line) this.line.style.cursor = "";
  }

  onDrag(event) {
    if (!this.isDragging) return;
    if (event.cancelable) event.preventDefault();
    this.slide(event);
  }

  slide(event) {
    const offsetX = this.getOffsetX(event);
    if (!this.wrapper.offsetWidth) return;

    const percent = Math.max(1, Math.min(99, (offsetX / this.wrapper.offsetWidth) * 100));

    this.beforeImage.style.width = `${percent}%`;
    this.handler.style.left = `${percent}%`;
    if (this.line) this.line.style.left = `${percent}%`;
    this.beforeImage.style.visibility = percent <= 0 ? "hidden" : "visible";
  }

  getOffsetX(event) {
    const rect = this.wrapper.getBoundingClientRect();
    if (event.type.startsWith("touch")) {
      const touch = event.touches[0] || event.changedTouches[0];
      return touch ? touch.clientX - rect.left : 0;
    }
    return event.clientX - rect.left;
  }
}

window.customElements.define("image-comparison", ImageComparison);

class Marquee extends HTMLElement {
  constructor() {
    super();
  }

  async connectedCallback() {
    this.wrapper = this.querySelector(".theme-marquee__wrapper");
    this.group = this.querySelector(".theme-marquee__group");
    this.marquee = this.querySelector(".theme-marquee");
    if (!this.wrapper || !this.group || !this.marquee) return;

    this.cloneGroups();
    this.wrapper.classList.add("is-ready");
  }

  cloneGroups() {
    const clonesSize = Math.min(7, Math.max(1, Number(this.marquee.dataset.clonesSize) || 2));
    const existingClones = this.wrapper.querySelectorAll('.theme-marquee__group[aria-hidden="true"]');

    [...existingClones].slice(clonesSize).forEach((node) => node.remove());

    const needed = clonesSize - this.wrapper.querySelectorAll('.theme-marquee__group[aria-hidden="true"]').length;
    for (let i = 0; i < needed; i++) {
      const clone = this.group.cloneNode(true);
      clone.setAttribute("aria-hidden", "true");
      clone
        .querySelectorAll("a, button, input, select, textarea, [tabindex]")
        .forEach((element) => element.setAttribute("tabindex", "-1"));
      this.wrapper.appendChild(clone);
    }
  }
}

window.customElements.define("theme-marquee", Marquee);

class CookieConsentElement extends HTMLElement {
  constructor() {
    super();

    this.handleAcceptAll = () => this.saveConsent("accepted");
    this.handleRejectAll = () => this.saveConsent("rejected");
    this.handleManage = () => this.modal.show();
    this.handleModalAccept = () => this.saveModalConsent("accepted");
    this.handleModalReject = () => this.saveModalConsent("rejected");

    this.saveConsent = (state) => {
      const preferences = {
        necessary: true,
        performance: state === "accepted",
        personalization: state === "accepted",
        marketing: state === "accepted",
      };
      this.storeConsent(state, preferences);
    };

    this.saveModalConsent = (state) => {
      const preferences = {
        necessary: true,
        performance: state === "accepted",
        personalization: state === "accepted",
        marketing: state === "accepted",
      };
      this.storeConsent(state, preferences);
      this.modal?.hide();
    };

    this.saveCustomPreferences = () => {
      const preferences = {
        necessary: true,
        performance: this.performanceSwitch?.checked,
        personalization: this.personalizationSwitch?.checked,
        marketing: this.marketingSwitch?.checked,
      };
      this.storeConsent("custom", preferences);
      this.modal?.hide();
    };

    this.loadSwitches = () => {
      const consentData = JSON.parse(localStorage.getItem("cookie-consent"));
      if (consentData?.preferences) {
        if (this.performanceSwitch) this.performanceSwitch.checked = consentData.preferences.performance;
        if (this.personalizationSwitch) this.personalizationSwitch.checked = consentData.preferences.personalization;
        if (this.marketingSwitch) this.marketingSwitch.checked = consentData.preferences.marketing;
      }
    };
  }

  async connectedCallback() {
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;

    await this.waitForBootstrap();

    this.banner = this.querySelector(".cookie-banner");
    this.acceptAllBtn = this.querySelector("[data-accept-all]");
    this.rejectAllBtn = this.querySelector("[data-reject-all]");
    this.manageBtn = this.querySelector("[data-manage]");
    this.modalEl = this.querySelector(".cookie-modal");
    this.modalAcceptAllBtn = this.querySelector("[data-modal-accept]");
    this.modalRejectAllBtn = this.querySelector("[data-modal-reject]");
    this.modalSaveSelectionBtn = this.querySelector("[data-modal-save]");
    this.performanceSwitch = this.querySelector("[data-switch=performance]");
    this.personalizationSwitch = this.querySelector("[data-switch=personalization]");
    this.marketingSwitch = this.querySelector("[data-switch=marketing]");

    this.modal = new bootstrap.Modal(this.modalEl);

    const consent = localStorage.getItem("cookie-consent");
    if (!consent) {
      this.banner.classList.remove("d-none");
      this.initializeConsent();
    } else {
      this.banner.classList.add("d-none");
      this.applyStoredConsent();
    }

    this.acceptAllBtn?.addEventListener("click", this.handleAcceptAll);
    this.rejectAllBtn?.addEventListener("click", this.handleRejectAll);
    this.manageBtn?.addEventListener("click", this.handleManage);

    this.modalAcceptAllBtn.addEventListener("click", this.handleModalAccept);
    this.modalRejectAllBtn.addEventListener("click", this.handleModalReject);
    this.modalSaveSelectionBtn.addEventListener("click", this.saveCustomPreferences);

    this.modalEl.addEventListener("show.bs.modal", this.loadSwitches);
  }

  disconnectedCallback() {
    this.acceptAllBtn?.removeEventListener("click", this.handleAcceptAll);
    this.rejectAllBtn?.removeEventListener("click", this.handleRejectAll);
    this.manageBtn?.removeEventListener("click", this.handleManage);

    this.modalAcceptAllBtn?.removeEventListener("click", this.handleModalAccept);
    this.modalRejectAllBtn?.removeEventListener("click", this.handleModalReject);
    this.modalSaveSelectionBtn?.removeEventListener("click", this.saveCustomPreferences);
    this.modalEl?.removeEventListener("show.bs.modal", this.loadSwitches);
  }

  storeConsent(state, preferences) {
    localStorage.setItem("cookie-consent", JSON.stringify({ state, preferences }));
    this.banner.classList.add("d-none");
    this.applyGtagConsent(preferences);

    const event = new CustomEvent("consent-changed", {
      detail: { state, preferences },
      bubbles: true,
      composed: true,
    });
    window.dispatchEvent(event);
  }

  applyGtagConsent(preferences) {
    if (typeof window.gtag !== "function") return;
    window.gtag("consent", "update", {
      analytics_storage: preferences?.performance ? "granted" : "denied",
      ad_personalization: preferences?.personalization ? "granted" : "denied",
      ad_storage: preferences?.marketing ? "granted" : "denied",
      ad_user_data: preferences?.marketing ? "granted" : "denied",
    });
  }

  applyStoredConsent() {
    const stored = JSON.parse(localStorage.getItem("cookie-consent"));
    if (stored?.preferences) this.applyGtagConsent(stored.preferences);
  }

  initializeConsent() {
    if (typeof window.gtag !== "function") return;
    window.gtag("consent", "default", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
      wait_for_update: 500,
    });
  }

  waitForBootstrap() {
    if (window.bootstrap?.Modal) return Promise.resolve();

    return new Promise((resolve) => {
      // after 3s resolve promisse either way
      const timeout = setTimeout(() => {
        clearInterval(interval);
        resolve();
      }, 3000);

      // 30ms poll for bootstrap
      const interval = setInterval(() => {
        if (window.bootstrap?.Modal) {
          clearTimeout(timeout);
          clearInterval(interval);
          resolve();
        }
      }, 30);
    });
  }
}

window.customElements.define("cookie-consent", CookieConsentElement);

jQuery(() => {
  console.info(`[${new Date(Date.now()).toLocaleTimeString("en-GB", { hour12: false })}] Loaded theme.js`);

  adjustFlyoutSubmenusPosition();
  applyClassNamesForStyling();
  cycleProductBlockImagesOnHover();
  initializeProductPage();
  initializeSelectedProduct();
  initializeProductBlockInputs();
  filtersCountOnButton();
  applyProseStyles(".product-page__description");
  setupStoreProductAddToCartButtons();
  updateAutoCompletePosition();
  animationObserverBehavior();
});

// TODO: move to Jumpseller file
async function getAvailableTimeslotsSingleDate(productId, date) {
  let effectiveDate = date; // must be 'YYYY-MM-DD' format
  if (!effectiveDate) {
    effectiveDate = new Date().toISOString().split("T")[0]; // 'YYYY-MM-DD' format
  }

  const response = await window.fetch(`/api/products/${productId}/appointment_timeslots?date=${effectiveDate}`);
  if (response.ok) {
    const timeslots = await response.json();
    return timeslots;
  } else {
    throw {};
  }
}

async function getAvailableTimeslotsInRange(productId, startDate, endDate) {
  const response = await window.fetch(
    `/api/products/${productId}/appointment_timeslots?start_date=${startDate}&end_date=${endDate}`,
  );
  if (response.ok) {
    const timeslots = await response.json();
    return timeslots;
  } else {
    throw {};
  }
}
class ImageAccordion {
  constructor(element) {
    this.accordion = element;
    this.items = Array.from(element.querySelectorAll(".image-accordion__item"));
    this.orientation = element.dataset.orientation || "horizontal";
    this.mode = element.dataset.mode || "hover";
    this.isMobile = window.matchMedia("(max-width: 767px)").matches;
    this.wasMobile = this.isMobile;

    this.init();
    this.setupResizeObserver();
  }

  init() {
    this.updateDataAttributes();
    this.setupEventListeners();
    this.initializeFirstItem();
  }

  updateDataAttributes() {
    if (this.isMobile) {
      this.accordion.dataset.orientation = "vertical";
      this.accordion.dataset.mode = "click";
    } else {
      this.accordion.dataset.orientation = this.orientation;
      this.accordion.dataset.mode = this.mode;
    }
  }

  setupEventListeners() {
    const currentMode = this.accordion.dataset.mode;

    this.removeEventListeners();

    this.items.forEach((item) => {
      if (currentMode === "hover" && !this.isMobile) {
        item.addEventListener("mouseenter", this.handleHover.bind(this, item));
      } else {
        item.addEventListener("click", this.handleClick.bind(this, item));
      }
    });
  }

  removeEventListeners() {
    this.items.forEach((item) => {
      const newItem = item.cloneNode(true);
      item.parentNode.replaceChild(newItem, item);
    });

    this.items = Array.from(this.accordion.querySelectorAll(".image-accordion__item"));
  }

  handleHover(item) {
    this.setActiveItem(item);
  }

  handleClick(item, event) {
    if (event && event.target.closest("a, button")) {
      return;
    }

    this.setActiveItem(item);
  }

  setActiveItem(item) {
    this.items.forEach((i) => i.classList.remove("image-accordion__item--active"));
    item.classList.add("image-accordion__item--active");
  }

  initializeFirstItem() {
    const firstOpen = this.accordion.querySelector(".image-accordion__item--active");

    if (!firstOpen && this.items.length > 0) {
      // If no item is marked as active, don"t force one open
      // This respects the first_open setting from Liquid
      return;
    }
  }

  setupResizeObserver() {
    const mediaQuery = window.matchMedia("(max-width: 767px)");

    mediaQuery.addEventListener("change", (e) => {
      this.isMobile = e.matches;

      if (this.isMobile !== this.wasMobile) {
        this.updateDataAttributes();
        this.resetAccordionState();
        this.setupEventListeners();
        this.wasMobile = this.isMobile;
      }
    });
  }

  resetAccordionState() {
    this.items.forEach((item) => {
      item.classList.remove("image-accordion__item--active");
    });

    this.accordion.offsetHeight;

    const firstOpen = this.accordion.querySelector(".image-accordion__item--active");

    if (!firstOpen && this.items.length > 0) {
      const shouldOpenFirst = this.accordion.dataset.firstOpen === "true";

      if (shouldOpenFirst) {
        this.items[0].classList.add("image-accordion__item--active");
      }
    }
  }

  destroy() {
    this.removeEventListeners();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const accordions = document.querySelectorAll(".image-accordion");

  accordions.forEach((accordion) => {
    new ImageAccordion(accordion);
  });
});

if (window.MutationObserver) {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1 && node.classList?.contains("image-accordion")) {
          new ImageAccordion(node);
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}
