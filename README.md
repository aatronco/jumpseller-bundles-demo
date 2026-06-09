# jumpseller-bundles-demo

Demo funcional de **Bundles / Packs** para Jumpseller, construida sobre la tienda de pruebas `alejandrotest.jumpseller.com`.

Es una **versión demostrativa** pensada para enseñar a developers y diseñadores cómo se vería y comportaría la feature, como base para una implementación nativa de la plataforma. El foco es el **diseño y la experiencia** (página de producto + carro); el script de setup de datos es desechable y los usuarios finales no lo usan.

> Proyecto independiente. No tiene relación con otros proyectos del sandbox.

## Qué es un pack (v1)

Un producto virtual (precio 0) con un custom field `bundle_components` que lista los productos componente reales. Al agregarlo al carro, se añaden los componentes (su inventario se descuenta nativamente) y se agrupan visualmente bajo el pack en la página de carrito.

## Estructura

```
docs/
  superpowers/specs/2026-06-09-bundles-demo-design.md   ← diseño completo (leer primero)
  engineering-wishlist.md                               ← deseos para la versión nativa
theme/                                                  ← tema de alejandrotest (se sincroniza a la tienda)
scripts/                                                ← setup de datos demo vía API/MCP (pendiente)
```

## Estado

🟡 **Diseño aprobado** — pendiente plan de implementación e implementación.

## Documentos clave

- **Diseño:** [`docs/superpowers/specs/2026-06-09-bundles-demo-design.md`](docs/superpowers/specs/2026-06-09-bundles-demo-design.md)
- **Lista de deseos para ingenieros (en inglés):** `docs/engineering-wishlist.md`
