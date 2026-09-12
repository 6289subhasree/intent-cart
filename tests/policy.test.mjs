import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true, hmr: false } });
after(async () => vite.close());
const commerce = await vite.ssrLoadModule("/lib/commerce.ts");

test("policy calculates totals from catalogue prices", () => {
  const result = commerce.evaluateCart([{ productId: "sku_cleanser_01", quantity: 2 }]);
  assert.equal(result.total, 109800);
  assert.equal(result.passed, true);
});

test("policy rejects unknown products and excessive quantities", () => {
  assert.equal(commerce.evaluateCart([{ productId: "made_up", quantity: 1 }]).quantitiesValid, false);
  assert.equal(commerce.evaluateCart([{ productId: "sku_cleanser_01", quantity: 4 }]).quantitiesValid, false);
});

test("repair swaps only the unavailable serum and preserves quantities", () => {
  const repaired = commerce.repairUnavailableSerum([{ productId: "sku_serum_04", quantity: 2 }, { productId: "sku_spf_07", quantity: 1 }]);
  assert.deepEqual(repaired, [{ productId: "sku_barrier_02", quantity: 2 }, { productId: "sku_spf_07", quantity: 1 }]);
});
