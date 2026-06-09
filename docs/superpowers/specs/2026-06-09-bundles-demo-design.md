# Diseño — Demo de Bundles/Packs (v1) para `alejandrotest`

**Fecha:** 2026-06-09
**Autor:** Alejandro (Jumpseller) + Claude
**Estado:** Diseño aprobado, pendiente de revisión final del usuario
**Tienda objetivo:** `alejandrotest.jumpseller.com`
**Toolkit:** [github.com/Jumpseller/ai](https://github.com/Jumpseller/ai) — skills `jumpseller-api`, `jumpseller-liquid`, `jumpseller-mcp`, `jumpseller-cli` + MCP `mcp.jumpseller.com`.

---

## 1. Propósito y alcance

Construir una **versión funcional (demo) de la feature de "bundles/packs"** en la tienda de pruebas, para mostrarla a developers y diseñadores como base que ellos mejoren hacia una implementación nativa.

**Qué es un pack en esta v1:** un **producto virtual** (producto normal de Jumpseller con `price = 0`) que, al agregarse al carro, añade al carro **cada uno de sus productos componente reales**, agrupándolos visualmente bajo el pack. El inventario se descuenta nativamente porque los componentes son productos reales en el carro; el ancla a $0 no afecta el total.

**No-objetivos de v1 (explícitos):**
- El cliente **no** elige variantes (solo el admin las fija en la definición del pack).
- Solo se agrupa visualmente en la **página de carrito** (Liquid). No se toca el mini-cart del header ni el checkout (SPA React). El inventario y el total igual son correctos en checkout porque los componentes son líneas reales.
- No se construye la versión nativa (backend) — eso es la "lista de deseos para ingenieros" (§9).

---

## 2. Decisiones tomadas (cerradas)

| Decisión | Elección |
|---|---|
| Superficie de agrupación | **Solo página de carrito** (Liquid) |
| Rigidez del pack | Cantidad de pack fija en 1; cantidades de componentes **bloqueadas** |
| Borrado: eliminar pack | Borra **ancla + todos los componentes** |
| Borrado: eliminar un componente | **Rompe el pack**: el ancla $0 desaparece, los componentes restantes quedan como productos sueltos normales, se limpia la membresía |
| Setup de datos | **Script vía API/MCP** (idempotente, re-ejecutable) |
| Arquitectura | **Enfoque A** — theme-native, orquestado por JS (custom element + `bundles.js` + `localStorage`) |
| Mecanismo de agrupación | Dirigido por JS (robusto), con sondeo de Liquid nativo como optimización opcional |

---

## 3. Modelo de datos

**El pack = producto virtual:**
- Producto normal con `price = 0`, idealmente `stock_unlimited = true` (el ancla nunca limita stock).
- Custom field **`bundle_components`** (tipo texto largo) aplicado a productos.

**Formato de `bundle_components`** (definido por el usuario): permalinks separados por coma, variante opcional con `?variant_id:`:

```
remera-basica?variant_id:1234567,gorro-lana,medias-pack3?variant_id:7654321
```

- Sin `?variant_id:` → se usa la primera variante / el producto simple.
- El separador de variante es `?variant_id:<id>` (sintaxis propia del campo, no una URL real; se parsea por split).

**Datos demo creados por el script (§7):**
1. Custom field `bundle_components` aplicado a productos.
2. 2–3 productos componente reales con **stock finito** (p. ej. `remera-basica` stock 10, `gorro-lana` stock 5, `medias-pack3` stock 8) — para demostrar el descuento de inventario.
3. 1 producto pack virtual (p. ej. `pack-invierno`, precio 0) con `bundle_components` apuntando a los componentes.

---

## 4. Arquitectura (Enfoque A)

Tres piezas, imitando la **convención de custom elements** que ya usa el tema (`<cart-area>`, `<product-form>`, `<product-wishlist>`):

```
Página de producto (pack)                Carro
┌───────────────────────────┐           ┌────────────────────────────┐
│ <product-bundle> + JSON    │           │ <cart-area> renderiza       │
│   (lista de componentes)   │           │   order.products (Liquid)   │
└──────────────┬────────────┘           └──────────────┬─────────────┘
               │ submit interceptado                    │ DOM leído/reescrito
               ▼                                         ▼
        ┌─────────────────────  bundles.js  ─────────────────────┐
        │ add-to-cart: POST ancla + N componentes → /cart/add/…  │
        │ guarda membresía en localStorage                       │
        │ carro: agrupa filas, suma precio, bloquea qty,         │
        │        cablea remove-pack y break-on-component-remove  │
        └────────────────────────────────────────────────────────┘
```

### 4.1 Resolución permalink → datos del componente (PROBE)

Punto técnico a resolver durante implementación:

- **Ideal (server-side):** si Liquid puede resolver un producto por permalink en la página del pack, se emite por componente: `product_id`, `variant_id`, `name`, `image`, `price`. Permite mostrar el **precio del pack ya sumado en la página de producto** y evita requests extra.
- **Fallback (client-side):** si Liquid no resuelve permalinks arbitrarios, `bundles.js` hace `fetch` del JSON de cada producto componente en runtime para obtener `product_id`/`variant_id`/`price` (N requests).

La implementación primero **sondea** la opción server-side; si no existe, usa el fallback.

---

## 5. Flujo "Agregar al carro" (página de producto)

1. Liquid pinta `<product-bundle>` **solo si** `prod.product_fields` contiene `bundle_components`, con un JSON de config listando los componentes.
2. `bundles.js` intercepta el `submit` del form del pack (previene el POST normal).
3. POST del **ancla** → `/cart/add/<pack_id>` qty 1.
4. POST de **cada componente** → `/cart/add/<product_id>?variant_id=<v>` qty 1.
   - Mismo endpoint que ya usa el tema (`store_product.liquid:157`, `:191`). No se inventa API.
5. Registra la **membresía** en `localStorage`:
   `{ <pack_line_id>: { components: [<line_ids>], pack_permalink } }`.
6. Dispara la notificación/redirección a carro que ya usa el tema.

---

## 6. Display y comportamiento en el carro

`bundles.js`, al cargar la página de carro, lee la membresía y por cada ancla presente:

1. **Agrupa**: mueve las filas de componentes bajo el ancla, indentadas (badge `PACK`).
2. **Precio del ancla** = suma de los precios de línea de los componentes (ya traen promociones aplicadas por Liquid). Reemplaza visualmente el $0.
3. **Imagen padre** = la del producto pack (el ancla ya la trae).
4. **Bloquea** las qty de los componentes (solo lectura) y oculta la qty del ancla (fija 1).
5. **Remove atómico** (botón "Eliminar pack" en el ancla): borra ancla + todos los componentes; limpia `localStorage`.
6. **Romper el pack** (eliminar un componente): borra el **ancla** + se deshace el agrupado; los componentes restantes quedan como **líneas normales**; limpia `localStorage`.

### Mockup

```
┌─────────────────────────────────────────────┐
│  🛒 Carro                          [Vaciar]  │
├─────────────────────────────────────────────┤
│ ╔═ PACK ═══════════════════════════════════╗ │
│ ║ [img]  Pack Invierno            $19.970   ║ │ ← ancla, precio = suma componentes
│ ║                                 [🗑 Pack] ║ │ ← remove atómico
│ ║   ↳ [img] Remera Básica   x1    $9.990    ║ │ ← componente, qty bloqueada
│ ║   ↳ [img] Gorro de Lana   x1    $5.990    ║ │
│ ║   ↳ [img] Medias Pack 3   x1    $3.990    ║ │
│ ╚═══════════════════════════════════════════╝ │
│ [img] Otro producto suelto  x2     $12.000    │ ← producto normal, intacto
├─────────────────────────────────────────────┤
│ Subtotal                           $31.970    │
└─────────────────────────────────────────────┘
```

---

## 7. Setup de datos (script API/MCP)

> **Prioridad baja / desechable.** El setup solo siembra datos de prueba; los usuarios finales no lo usan. El esfuerzo del proyecto va al **diseño/experiencia** (página de producto + carro). Puede incluso hacerse directo por MCP sin un script pulido; si se escribe, basta algo simple.

`scripts/setup-demo-bundles.*` — **idempotente y re-ejecutable**:

0. **Valida credenciales** (Login key + Auth Token) contra `GET /store/info.json`. Bloquea si falla (ver Riesgos).
1. Crea/asegura el custom field `bundle_components` aplicado a productos.
2. Crea/asegura 2–3 productos componente con stock finito.
3. Crea/asegura el producto pack virtual (precio 0) con `bundle_components` relleno.

Usa la skill `jumpseller-api` / servidor MCP. Los devs pueden re-ejecutarlo para regenerar la demo.

---

## 8. Estrategia de testing

- **Unit (lógica pura JS, TDD):** parseo de `bundle_components`, cálculo de membresía, suma de precios. Funciones puras testeables en aislamiento.
- **End-to-end (Playwright MCP contra `alejandrotest`):**
  1. Agregar el pack → ver agrupado + precio sumado correcto.
  2. Confirmar que el **stock de los componentes baja** y el del pack no.
  3. "Eliminar pack" → todo fuera.
  4. Eliminar un componente → pack roto, resto suelto.
- **Sync del tema** a la tienda vía el mecanismo del CLI de Jumpseller (existe `theme/.jumpseller-store`).

Frontera deliberada: lo determinista se testea con unit tests; la integración con la plataforma (endpoints de carro, render Liquid, descuento de stock) se verifica contra la tienda real.

---

## 9. Lista de deseos para ingenieros (handoff)

Se entrega como `docs/engineering-wishlist.md` (en inglés). Deseos de la versión "de verdad" (B, nativa), más allá de la demo:

1. **Versión nativa Liquid + backend**: que la plataforma guarde la membresía del pack server-side y exponga objetos Liquid (componentes resueltos, grupos en `order.products`) + un custom element `<product-bundle>` nativo. Independiente de dispositivo (hoy `localStorage` es per-browser).
2. **Función nativa de batch add-to-cart**: agregar varios productos en una sola llamada, en vez de N POST secuenciales.
3. **Forma nativa de armar el pack**: un **tipo de producto `pack`** propio (idea tomada de la doc de BigCommerce), en vez de custom fields.
4. **Selección de variante por el cliente** en el storefront (v1 solo el admin).
5. **Resolver el caso "componente comprado también suelto"**: Jumpseller fusiona líneas idénticas por variante → el agrupado y el remove atómico se vuelven ambiguos. La membresía server-side lo resuelve.
6. **Precio/promociones del pack** a nivel de pack (descuentos sobre el combo completo).
7. Esto podría vivir en una **App**, pero lo ideal es **soporte nativo** de la plataforma.

---

## 10. Riesgos y supuestos

| Riesgo / Supuesto | Mitigación |
|---|---|
| Credenciales API de `alejandrotest` podrían fallar ("Failed to Login" visto en otro proyecto) | Paso 0 del script valida antes de escribir; bloqueante hasta resolver |
| Liquid podría no resolver permalinks arbitrarios en la página del pack | Probe con fallback client-side (`fetch` por componente) |
| El line item del carro no expone `product_fields` en este tema | La membresía se guarda en `localStorage` al agregar, no se depende de leer el campo desde el carro |
| `localStorage` es per-dispositivo / se pierde si se limpia | Aceptable para demo; documentado como deseo (#1) para versión nativa |
| Componente comprado suelto + en pack se fusiona en una línea | Documentado como limitación conocida (deseo #5); en demo se asume componentes dedicados al pack |
| Endpoint exacto y params de `/cart/add` (variant_id, qty, respuesta AJAX vs redirect) | Verificar empíricamente con Playwright/red al inicio de la implementación |

---

## 11. Inventario de archivos

| Archivo | Acción |
|---|---|
| `theme/components/product-bundle.liquid` (+ `.json`) | 🆕 custom element del pack en página de producto |
| `theme/assets/bundles.js` | 🆕 add-to-cart + agrupado + remove/break |
| `theme/components/product-template.liquid` | ✏️ incluir `<product-bundle>` |
| `theme/templates/layout.liquid` | ✏️ cargar `bundles.js` |
| `scripts/setup-demo-bundles.*` | 🆕 setup de datos vía API/MCP |
| `docs/engineering-wishlist.md` | 🆕 lista de deseos para el equipo (en inglés) |
