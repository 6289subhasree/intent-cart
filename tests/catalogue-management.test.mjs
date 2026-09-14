import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { createD1, testRequest } from "./helpers/d1.mjs";

test("custom categories work through recommendation and checkout; reserved products cannot disappear", async () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const vite = await createServer({ configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true, hmr: false } });
  const db = createD1(); globalThis.__INTENTCART_DB__ = db;
  const names = ["GEMINI_API_KEY", "OPENAI_API_KEY", "PAYMENT_ORDER_API_URL", "PAYMENT_KEY_ID", "PAYMENT_KEY_SECRET"];
  const env = Object.fromEntries(names.map(n => [n, process.env[n]])); names.forEach(n => delete process.env[n]);
  try {
    const catalogue = await vite.ssrLoadModule("/app/api/catalogue/route.ts"); const agent = await vite.ssrLoadModule("/app/api/agent/route.ts"); const checkout = await vite.ssrLoadModule("/app/api/checkout/route.ts"); const repo = await vite.ssrLoadModule("/db/repository.ts");
    const product = { id: "headphones_one", name: "Studio Headphones", detail: "Over-ear wired headphones", category: "headphones", price: 120000, stock: 3, deliveryDays: 7, tags: [], crop: "product-one", imageUrl: "https://example.com/headphones.jpg" };
    const save = (products, version) => catalogue.PUT(testRequest({ products, version }, "/api/catalogue", "PUT"));
    assert.equal((await save([product, product], "test-version")).status, 400);
    assert.equal((await save([{ ...product, imageUrl: "javascript:alert(1)" }], "test-version")).status, 400);
    const saved = await save([product], "test-version"); assert.equal(saved.status, 200);
    const version = (await saved.json()).version;
    assert.equal((await agent.POST(testRequest({ intent: "headphones under 1500 delivered within 2 days" }))).status, 422);
    assert.equal((await agent.POST(testRequest({ intent: "headphones under 1500 without headphones" }))).status, 422);
    assert.equal((await agent.POST(testRequest({ intent: "skincare under 1500" }))).status, 422);
    const response = await agent.POST(testRequest({ intent: "headphones under 1500 delivered within 7 days" }));
    assert.equal(response.status, 200); const cart = await response.json(); assert.equal(cart.items[0].id, product.id); assert.equal(cart.total, 120000);
    const pending = await repo.claimCheckout(await repo.getSession(cart.id, "test-store"), "custom-reservation", "local_test"); assert.ok(pending);
    const current = await (await catalogue.GET(testRequest(undefined, "/api/catalogue", "GET"))).json();
    assert.equal((await save([], current.version)).status, 409);
    assert.equal((await save([{ ...product, category: "speaker" }], current.version)).status, 409);
    assert.equal((await save([product], version)).status, 409);
    const second = await (await agent.POST(testRequest({ intent: "headphones under 1500" }))).json();
    assert.equal((await checkout.POST(testRequest({ sessionId: second.id, cartVersion: second.cartVersion, approval: true }))).status, 200);
    assert.equal((await (await catalogue.GET(testRequest(undefined, "/api/catalogue", "GET"))).json()).products[0].stock, 1);
  } finally { for (const name of names) { if (env[name] === undefined) delete process.env[name]; else process.env[name] = env[name]; } delete globalThis.__INTENTCART_DB__; db.close(); await vite.close(); }
});
