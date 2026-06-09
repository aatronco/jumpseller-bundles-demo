#!/usr/bin/env node
/**
 * setup-demo-bundles.mjs — Throwaway seeding for the Bundles/Packs demo on `alejandrotest`.
 *
 * Idempotent. It:
 *   0. Validates API creds (GET /store/info.json).
 *   1. Ensures the single custom field `bundle_components` (comma-separated permalinks).
 *   2. Finds the component products by permalink (must already exist in the store).
 *   3. Finds-or-creates the virtual pack product (price 0, stock unlimited).
 *   4. Sets `bundle_components` on the pack = the component permalinks (the ONLY source of
 *      truth; component ids + prices are resolved live at runtime by assets/bundles.js).
 *   5. Writes scripts/demo-fixtures.json for the e2e tests.
 *
 * Creds from env: JUMPSELLER_LOGIN + JUMPSELLER_AUTH_TOKEN (falls back to JUMPSELLER_AUTH).
 * If env is missing, it tries to load a sibling ../.env.
 *
 * NOTE (per project decision): the setup is low-priority/throwaway — end users never run it.
 * It exists only so engineers can re-seed the demo. Components are tied to this store's
 * baking catalog; if a component permalink is missing the script errors clearly.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- config ----
const PACK = {
  name: "Pack Queque Casero",
  permalink: "pack-queque-casero",
  description:
    "Pack demo: al agregarlo se añaden sus ingredientes al carro y se descuenta su inventario.",
};
const COMPONENT_PERMALINKS = [
  "harina-1kg",
  "huevo-deshidratado-equivalente-a-5-huevos",
  "mantequilla-250-g",
];

// ---- creds (env, with .env fallback) ----
function loadEnvFallback() {
  // .env (gitignored) is the authoritative credential source for this demo: when present,
  // its values OVERRIDE the shell environment (the dev shell may export an empty/stale
  // JUMPSELLER_AUTH). If there is no .env, we rely on the real environment.
  try {
    const txt = readFileSync(join(__dirname, "..", ".env"), "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
      if (m) process.env[m[1]] = m[2];
    }
  } catch {
    /* no .env, rely on real env */
  }
}
loadEnvFallback();

const LOGIN = process.env.JUMPSELLER_LOGIN;
const TOKEN = process.env.JUMPSELLER_AUTH_TOKEN || process.env.JUMPSELLER_AUTH;
if (!LOGIN || !TOKEN) {
  console.error("✗ Missing JUMPSELLER_LOGIN / JUMPSELLER_AUTH_TOKEN (or JUMPSELLER_AUTH).");
  process.exit(1);
}
const BASE = "https://api.jumpseller.com/v1";
const AUTH = "Basic " + Buffer.from(`${LOGIN}:${TOKEN}`).toString("base64");

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  return { status: res.status, json, text };
}

async function ensureCustomField(label) {
  const list = await api("GET", "/custom_fields.json");
  const found = (list.json?.custom_fields || []).find((f) => f.label === label);
  if (found) return found.id;
  const created = await api("POST", "/custom_fields.json", {
    custom_field: { label, type: "text", product_visibility: true },
  });
  if (created.status >= 300) throw new Error(`create custom_field ${label}: ${created.text}`);
  return created.json.custom_field.id;
}

async function findProductByPermalink(permalink) {
  // store is small (<100 products); one page is enough
  const list = await api("GET", "/products.json?limit=100");
  return (list.json || []).map((w) => w.product).find((p) => p.permalink === permalink) || null;
}

async function setField(productId, customFieldId, value) {
  // Idempotent: a product holds at most one value instance per custom field.
  // If one exists → PUT to update it; otherwise → POST to create it.
  const existing = await api("GET", `/products/${productId}/fields.json`);
  const instance = (existing.json?.fields || [])
    .map((w) => w.field)
    .find((f) => f.custom_field_id === customFieldId);
  const r = instance
    ? await api("PUT", `/products/${productId}/fields/${instance.id}.json`, {
        field: { id: customFieldId, value },
      })
    : await api("POST", `/products/${productId}/fields.json`, {
        field: { id: customFieldId, value },
      });
  if (r.status >= 300) throw new Error(`set field ${customFieldId} on ${productId}: ${r.text}`);
}

async function main() {
  // 0. validate creds
  const info = await api("GET", "/store/info.json");
  if (info.status !== 200) {
    console.error(`✗ Credential check failed (HTTP ${info.status}): ${info.text}`);
    process.exit(1);
  }
  console.log(`✓ Auth OK — store: ${info.json.store?.name} (${info.json.store?.currency})`);

  // 1. custom field (single source of truth — permalinks; everything else resolved live)
  const cfHuman = await ensureCustomField("bundle_components");
  console.log(`✓ custom field: bundle_components=${cfHuman}`);

  // 2. components
  const components = [];
  for (const permalink of COMPONENT_PERMALINKS) {
    const p = await findProductByPermalink(permalink);
    if (!p) throw new Error(`Component product not found by permalink "${permalink}". Create it in the store first.`);
    components.push({
      id: p.id,
      permalink: p.permalink,
      variant_id: null,
      price: p.price,
      name: p.name,
      image: p.images?.[0]?.url || "",
    });
    console.log(`  • component ${p.permalink} (id=${p.id}, $${p.price})`);
  }

  // 3. pack (find or create)
  let pack = await findProductByPermalink(PACK.permalink);
  if (!pack) {
    const created = await api("POST", "/products.json", {
      product: {
        name: PACK.name,
        price: 0,
        type: "digital", // virtual $0 anchor — no shipping/weight
        stock_unlimited: true,
        status: "available",
        description: PACK.description,
      },
    });
    if (created.status >= 300) throw new Error(`create pack: ${created.text}`);
    pack = created.json.product;
    console.log(`✓ created pack ${pack.permalink} (id=${pack.id})`);
  } else {
    console.log(`✓ pack exists ${pack.permalink} (id=${pack.id})`);
  }

  // 4. set the field value (comma-separated permalinks, optional ?variant_id:<id>)
  const humanValue = components.map((c) => c.permalink).join(",");
  await setField(pack.id, cfHuman, humanValue);
  console.log(`✓ set bundle_components on pack = "${humanValue}"`);

  // 5. fixtures
  const fixtures = {
    packPermalink: pack.permalink,
    packId: pack.id,
    packUrl: `https://alejandrotest.jumpseller.com/${pack.permalink}`,
    components: components.map((c) => ({ permalink: c.permalink, id: c.id, price: c.price })),
    priceSum: components.reduce((a, c) => a + c.price, 0),
  };
  writeFileSync(join(__dirname, "demo-fixtures.json"), JSON.stringify(fixtures, null, 2) + "\n");
  console.log(`✓ wrote scripts/demo-fixtures.json`);
}

main().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
