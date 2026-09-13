import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

test("supported intent parsing uses paise and stable delivery reference dates", async () => {
  const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false } });
  try {
    const { parseShoppingIntent, evaluateIntentCart } = await vite.ssrLoadModule("/lib/shopping-intent.ts");
    for (const [input, expected] of [["Sunscreen budget 600", 60000], ["Sunscreen under INR 1,200.50", 120050], ["Sunscreen up to 1.5k", 150000]]) {
      assert.equal(parseShoppingIntent(input).budget, expected);
    }
    const sunday = new Date("2026-09-13T12:00:00Z");
    assert.equal(parseShoppingIntent("Sunscreen before Friday", sunday).deliveryDays, 4);
    assert.equal(parseShoppingIntent("Sunscreen by Monday", sunday).deliveryDays, 1);
    assert.equal(evaluateIntentCart([{ productId: "sku_spf_07", quantity: 1 }], "Sunscreen by Monday", 200000, sunday).passed, false);
    assert.equal(evaluateIntentCart([], "Skincare under ₹2000", 200000, sunday).passed, false);
    assert.equal(evaluateIntentCart([{ productId: "sku_spf_07", quantity: -1 }], "Sunscreen", 200000, sunday).passed, false);
  } finally { await vite.close(); }
});
