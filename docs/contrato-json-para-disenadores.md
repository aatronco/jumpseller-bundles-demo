# El contrato del pack — para el equipo de diseño

> **La idea en una frase:** el diseño trabaja contra **un JSON** (y unas clases CSS).
> **Hoy** ese JSON lo arma el tema desde un custom field; **mañana** el equipo de dev te dará
> **el mismo JSON** desde el backend nativo. Lo que diseñas **no cambia** cuando cambie el backend.

---

## 1. El contrato: este JSON

Cada pack se describe con esta forma. Es lo único contra lo que diseñas:

```json
{
  "pack": {
    "id": 35681868,
    "name": "Pack Queque Casero",
    "url": "/pack-queque-casero"
  },
  "components": [
    { "id": 34745971, "permalink": "harina-1kg",                              "price": 2000, "qty": 2, "variant_id": null },
    { "id": 34745977, "permalink": "huevo-deshidratado-equivalente-a-5-huevos", "price": 2000, "qty": 1, "variant_id": null },
    { "id": 34745980, "permalink": "mantequilla-250-g",                        "price": 3500, "qty": 1, "variant_id": null }
  ]
}
```

Con eso el diseño tiene lo esencial para el pack: qué componentes lo forman, su precio y cantidad,
y el total (suma de `price × qty`). En el ejemplo: 2×$2.000 + $2.000 + $3.500 = **$9.500**.

> **Verifícalo en vivo:** en la página del pack, abre la consola y escribe `JBBundles.bundle` —
> verás exactamente este JSON (resuelto en vivo).

> **Nombre e imagen:** hoy los renderiza el storefront por cada producto (en el carro, cada línea
> ya trae su nombre e imagen reales). La versión nativa podría incluir `name`/`image` en el JSON
> para armar previews del pack en la página de producto.

> **Precio:** `price` es el precio **vigente** del componente. En el carro se lee del precio real de
> cada línea (con promociones aplicadas), así que nunca queda desactualizado.

---

## 2. Quién construye ese JSON (hoy vs. mañana)

Esto es lo que **cambia por detrás** — y que al diseño **no le afecta**:

| | Quién arma el JSON | Cómo |
|---|---|---|
| **HOY (demo)** | El tema | Un custom field `bundle_components` guarda los permalinks (`harina-1kg?qty:2,…`). El tema los resuelve **en Liquid** (`products.product[permalink]` → id, precio con descuento) — server-side, sin fetch. |
| **MAÑANA (nativo)** | El equipo de dev | Un objeto Liquid nativo, ej. `{{ product.bundle.products }}` (o un tipo de producto `pack`). El backend entrega el JSON ya armado. |

En ambos casos, el resultado que llega al tema es **el mismo JSON de la sección 1**. Por eso puedes
empezar a diseñar **ya**, sin esperar la arquitectura, la base de datos ni el backend.

```
  custom field  ─┐
                 ├─►  [ MISMO JSON ]  ─►  TU DISEÑO (template + CSS)
  Liquid nativo ─┘
   (cambia)            (estable)            (no cambia)
```

---

## 3. Qué pintas tú contra ese JSON

Tres superficies, con sus "ganchos" (clases) estables para estilar:

**Página de producto** — el elemento `<product-bundle>` lleva el JSON; se muestra el precio total
del pack (suma de componentes) donde iría el precio normal (`.product-page__price`).

**Listado / tarjeta de producto** (categoría, búsqueda, "También te puede interesar") — la tarjeta
del pack recibe un badge `.jb-pack-badge` ("PACK"), muestra el **precio sumado** (no el $0), y su
botón "Agregar" añade **todos los componentes** al carro.

**Carro y mini-cart** (página `/cart` y el drawer del header) — el pack se renderiza con esta
estructura fija en ambos (estilízala 100% con CSS):

```
.jb-pack                       ← caja del pack (lleva el badge "PACK")
  .jb-pack__anchor             ← cabecera: nombre del pack + precio total
  .jb-pack__component          ← cada componente del pack, anidado (marca "↳")
.store-product[data-jb-loose]  ← (fuera de la caja) unidad del mismo producto comprada suelta
```

> La fila `[data-jb-loose]` aparece **solo** cuando un componente se compra también suelto: Jumpseller
> fusiona la línea, y el tema la separa visualmente (la porción del pack queda dentro, el extra queda
> en esta fila aparte). Es cosmético — la línea sigue fusionada en el servidor (ver wishlist #5).

- **Cambios de aspecto** (colores, bordes, tipografía, espaciado, badge, mobile) → **solo CSS**
  (`theme/assets/bundles-cart.css`). Terreno 100% del diseño.
- **Cambios de estructura** (ej. tabla colapsable, mover el precio) → tocan el template/JS → ahí
  necesitas un dev al lado.

---

## TL;DR para la reunión

> *"Diseñen contra este JSON. Hoy lo arma el tema desde un campo; cuando dev termine el backend,
> les va a entregar exactamente el mismo JSON. Su trabajo (template + CSS sobre `.jb-pack`) no se
> rehace cuando cambie el backend."*
