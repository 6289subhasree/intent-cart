import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { createD1, testRequest } from "./helpers/d1.mjs";

test("two carts compete for the last unit; retries and stale editor saves cannot restore stock", async () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const vite = await createServer({ configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true, hmr: false } });
  const db = createD1(); globalThis.__INTENTCART_DB__ = db;
  const names = ["GEMINI_API_KEY", "OPENAI_API_KEY", "PAYMENT_ORDER_API_URL", "PAYMENT_KEY_ID", "PAYMENT_KEY_SECRET"];
  const env = Object.fromEntries(names.map(name => [name, process.env[name]]));
  names.forEach(name => delete process.env[name]);
  try {
    const agent = await vite.ssrLoadModule("/app/api/agent/route.ts");
    const checkout = await vite.ssrLoadModule("/app/api/checkout/route.ts");
    const catalogue = await vite.ssrLoadModule("/app/api/catalogue/route.ts");
    const repo = await vite.ssrLoadModule("/db/repository.ts");
    const products = JSON.parse((await db.prepare("SELECT catalogue_json FROM stores WHERE id = 'test-store'").first()).catalogue_json).map(p => p.id === "sku_spf_07" ? { ...p, stock: 1 } : p);
    await db.prepare("UPDATE stores SET catalogue_json = ? WHERE id = 'test-store'").bind(JSON.stringify(products)).run();
    const carts = await Promise.all([1, 2].map(async () => (await agent.POST(testRequest({ intent: "Only sunscreen under ₹600" }))).json()));
    const bodies = carts.map(c => ({ sessionId: c.id, cartVersion: c.cartVersion, approval: true }));
    const responses = await Promise.all(bodies.map(body => checkout.POST(testRequest(body))));
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
    const winner = responses.findIndex(r => r.status === 200);
    assert.equal((await checkout.POST(testRequest(bodies[winner]))).status, 200);
    const saved = await db.prepare("SELECT catalogue_json, catalogue_version FROM stores WHERE id = 'test-store'").first();
    assert.equal(JSON.parse(saved.catalogue_json).find(p => p.id === "sku_spf_07").stock, 0);
    assert.notEqual(saved.catalogue_version, "test-version");
    assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM orders").first()).count, 1);
    const loser = await repo.getSession(carts[1 - winner].id, "test-store");
    const confirmed = await repo.getSession(carts[winner].id, "test-store");
    assert.equal(confirmed.policy.checkoutAttempt.items[0].unitPrice, 59900);
    assert.equal(confirmed.policy.checkoutAttempt.items[0].name, "Cloudveil SPF 50");
    assert.equal(loser.status, "ready");
    assert.equal((await checkout.POST(testRequest(bodies[1 - winner]))).status, 409);
    assert.equal((await catalogue.PUT(testRequest({ version: "test-version", products }, "/api/catalogue", "PUT"))).status, 409);
    assert.equal((await repo.getAuditBundle(carts[winner].id, "test-store")).events.filter(e => e.title === "Stock reserved for checkout").length, 1);
  } finally {
    for (const name of names) { if (env[name] === undefined) delete process.env[name]; else process.env[name] = env[name]; }
    delete globalThis.__INTENTCART_DB__; db.close(); await vite.close();
  }
});

test("reservation failure rolls back approval and stock together", async () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const vite = await createServer({ configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true, hmr: false } });
  const db = createD1(); globalThis.__INTENTCART_DB__ = db;
  try {
    const repo = await vite.ssrLoadModule("/db/repository.ts");
    const commerce = await vite.ssrLoadModule("/lib/commerce.ts");
    const cart = [{ productId: "sku_spf_07", quantity: 1 }];
    const session = { id: "IC-rollback", storeId: "test-store", intent: "Only sunscreen under 600", title: "Sunscreen", mode: "deterministic_fallback", status: "ready", budget: 60000, total: 59900, currency: "INR", cartVersion: "rollback-version", fitScore: 0, cart, policy: { ...commerce.evaluateCart(cart, 60000), catalogueVersion: "test-version" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), approvedAt: null, orderId: null };
    await repo.createSession(session, []);
    await db.prepare("CREATE TRIGGER fail_reservation BEFORE UPDATE ON stores BEGIN SELECT RAISE(ABORT, 'reservation unavailable'); END").run();
    await assert.rejects(repo.claimCheckout(session, "rollback-key"));
    assert.equal((await repo.getSession(session.id, "test-store")).status, "ready");
    assert.equal(JSON.parse((await db.prepare("SELECT catalogue_json FROM stores WHERE id = 'test-store'").first()).catalogue_json).find(p => p.id === "sku_spf_07").stock, 23);
    assert.equal((await repo.getAuditBundle(session.id, "test-store")).events.length, 0);
  } finally { delete globalThis.__INTENTCART_DB__; db.close(); await vite.close(); }
});
