# Bundles / Packs — Lista de deseos para ingenier@s

Esta demo (`alejandrotest`) muestra **cómo se vería y comportaría** una feature de bundles/packs
en una tienda Jumpseller, hecha 100% en el tema (Liquid + JS), para que ustedes la lleven a una
**implementación nativa de la plataforma**. El foco fue el **diseño y la experiencia**, no el tooling.

- Diseño completo: [`docs/superpowers/specs/2026-06-09-bundles-demo-design.md`](superpowers/specs/2026-06-09-bundles-demo-design.md)
- Plan de implementación: [`docs/superpowers/plans/2026-06-09-bundles-demo.md`](superpowers/plans/2026-06-09-bundles-demo.md)

---

## Qué hace la demo hoy (y sus límites)

**Un pack = un producto virtual** (precio 0, stock ilimitado) con UN custom field
`bundle_components` = permalinks separados por coma, variante opcional `permalink?variant_id:<id>`.
Ej.: `harina-1kg,huevo-deshidratado-equivalente-a-5-huevos,mantequilla-250-g`.

Al agregar el pack al carro, `assets/bundles.js`:
1. resuelve cada permalink → `product_id` en runtime (descargando el HTML del producto y
   leyendo `.product-json[data-productid]`, porque **Liquid no permite buscar un producto
   arbitrario por permalink** — ver deseo #1);
2. agrega el ancla $0 + los componentes con `Jumpseller.addMultipleProductsToCart(...)`;
3. guarda en `localStorage` SOLO referencias estables (permalinks), nunca precios;
4. en la página de carro agrupa las líneas bajo el ancla, **suma los precios reales de las
   líneas del carro** (con promociones, siempre actual), bloquea las cantidades de los
   componentes, y cablea "Eliminar pack" (atómico) y "eliminar un componente → rompe el pack".

**Límites conocidos de la demo (a resolver en la versión nativa):**
- La membresía vive en `localStorage` → **es por-dispositivo** y se pierde si se limpia el navegador.
- La resolución permalink→id es client-side (N requests al agregar).
- Si un componente se compra **también suelto**, Jumpseller fusiona ambas en una sola línea por
  variante → el agrupado y el borrado atómico se vuelven ambiguos. La demo asume componentes
  dedicados al pack.
- Solo se agrupa visualmente en la **página de carrito** (el checkout es un SPA React no editable);
  el inventario y el total igual son correctos porque los componentes son líneas reales.

---

## Deseos para la versión nativa

### 1. Resolución de componentes en el backend + objetos Liquid
Hoy resolvemos permalinks→producto en JS porque **Liquid no expone** ninguna forma de obtener un
producto arbitrario por permalink (solo `product` en la página de producto y `collection.products`).
**Deseo:** que la plataforma guarde la relación del pack server-side y exponga en Liquid los
componentes ya resueltos (id, nombre, imagen, **precio en vivo con promociones**, stock) y los
**grupos dentro de `order.products`** del carro. Esto elimina el JS de resolución y el `localStorage`,
y hace el agrupado **independiente de dispositivo**.

> ⚠️ **Lección de la demo (no cachear precios):** una primera versión guardó nombre/precio/imagen
> "compilados" en un custom field. **Mal:** si cambia el precio de un componente, el cache queda
> desactualizado. La regla es **guardar solo referencias estables (id/permalink/variant) y leer
> precio/stock siempre en vivo.** La versión nativa debe respetar esto.

### 2. Batch add-to-cart nativo
El storefront **ya tiene** `Jumpseller.addMultipleProductsToCart([[id,qty],...], {callback})` y lo
usamos. **Deseo:** exponer ese batch-add también a nivel de **API/plataforma** y como concepto de
"pack" (agregar el pack agrega sus componentes en una operación atómica, no N llamadas).

### 3. Tipo de producto `pack` nativo (en vez de custom fields)
En vez de codificar los componentes en un custom field de texto, un **tipo de producto `pack`** de
primera clase (idea tomada de BigCommerce), con su propio editor en el admin para elegir componentes
y variantes. El ancla a $0 dejaría de ser un truco.

### 4. Selección de variante por el cliente
En v1 las variantes las fija solo el admin (el parser ya entiende `?variant_id:`). **Deseo:** permitir
que el cliente elija la variante de cada componente en el storefront (ej. talla, color).

### 5. Resolver el caso "componente comprado también suelto"
Hoy Jumpseller fusiona líneas idénticas por variante. **Deseo:** que la membresía server-side
distinga "esta unidad pertenece a un pack" de "esta unidad es suelta", para agrupar y borrar sin
ambigüedad.

### 6. Promociones / precio a nivel de pack
Hoy el precio del pack = suma de componentes. **Deseo:** poder aplicar un descuento sobre el combo
completo (precio de pack < suma), y que se refleje en carro y checkout.

### 7. Stock del pack en función de sus componentes
**Pendiente que dejó el usuario:** ¿qué pasa si un componente no tiene stock? Hoy confiamos en que el
add-to-cart del SDK ya lo bloquea (la callback devuelve `data.status ≠ 200`). **Deseo:** que el pack
muestre disponibilidad derivada del **mínimo** stock de sus componentes (no comprable si alguno está
agotado), y un mensaje claro en la página del pack.

### 8. ¿App o nativo?
Todo esto **podría** vivir en una App de Jumpseller, pero lo ideal es **soporte nativo** de la
plataforma para que cualquier tema lo aproveche sin instalar nada.

---

## Mapa de la implementación demo (para leerla rápido)

| Archivo | Rol |
|---|---|
| `theme/partials/product_bundle.liquid` | Emite `<product-bundle>` + JSON (pack id/url/name + `bundle_components` crudo) si el producto tiene el campo. |
| `theme/assets/bundle-core.js` | Funciones puras (UMD, testeadas): `parseBundleComponents`, `normalizePermalink`, `sumPrices`, `formatPrice`, `parsePrice`. |
| `theme/assets/bundles.js` | Glue del navegador: intercepta add-to-cart, resuelve ids, batch-add, agrupa el carro, suma en vivo, remove atómico / romper pack. |
| `theme/components/product-form.liquid` | Incluye `{% render 'product_bundle' %}` al final del form. |
| `theme/components/product-fields.liquid` | Oculta `bundle_components` de la ficha visible al cliente. |
| `theme/templates/layout.liquid` | Carga `bundle-core.js` + `bundles.js` después de `theme.js`. |
| `scripts/setup-demo-bundles.mjs` | Siembra el dato demo (custom field + pack `pack-queque-casero` + valor). Desechable. |
| `tests/bundle-core.test.js` | Tests unitarios de la lógica pura (`npm test`). |

**Datos demo en `alejandrotest`:** custom field `bundle_components` (id 88114); pack `pack-queque-casero`
(id 35681868, $0) con componentes Harina ($2.000) + Huevo deshidratado ($2.000) + Mantequilla ($3.500).
