import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { createD1, testRequest } from "./helpers/d1.mjs";

test("provider reconciliation verifies evidence, isolates stores and resolves stock once", async () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const vite = await createServer({ configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true, hmr: false } });
  const db = createD1(); globalThis.__INTENTCART_DB__ = db;
  const originalFetch = globalThis.fetch;
  const names = ["PAYMENT_RECONCILE_API_URL", "PAYMENT_KEY_ID", "PAYMENT_KEY_SECRET"];
  const env = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    const repo = await vite.ssrLoadModule("/db/repository.ts"); const route = await vite.ssrLoadModule("/app/api/orders/reconcile/route.ts");
    const recovery = await vite.ssrLoadModule("/lib/order-recovery.ts"); const commerce = await vite.ssrLoadModule("/lib/commerce.ts");
    const stock = async () => JSON.parse((await db.prepare("SELECT catalogue_json FROM stores WHERE id = 'test-store'").first()).catalogue_json).find(p => p.id === "sku_spf_07").stock;
    async function pending(id, mode = "external") {
      const now = new Date().toISOString(); const cart = [{ productId: "sku_spf_07", quantity: 1 }];
      const session = { id, storeId: "test-store", intent: "Only sunscreen under 600", title: "SPF", mode: "fallback", status: "ready", budget: 60000, total: 59900, currency: "INR", cartVersion: id + "-version", fitScore: 0, cart, policy: { ...commerce.evaluateCart(cart, 60000), catalogueVersion: (await db.prepare("SELECT catalogue_version FROM stores WHERE id = 'test-store'").first()).catalogue_version }, createdAt: now, updatedAt: now, approvedAt: null, orderId: null };
      await repo.createSession(session, []); const claimed = await repo.claimCheckout(session, id + "-key", mode);
      await db.prepare("UPDATE shopping_sessions SET approved_at = ? WHERE id = ?").bind(new Date(Date.now() - 120000).toISOString(), id).run();
      return claimed;
    }
    const send = id => route.POST(testRequest({ sessionId: id }));
    const a = await pending("IC-release");
    assert.equal((await send("IC-foreign")).status, 404);
    delete process.env.PAYMENT_RECONCILE_API_URL;
    assert.equal((await send(a.id)).status, 503); assert.equal(await stock(), 22);
    process.env.PAYMENT_RECONCILE_API_URL = "https://provider.example/reconcile"; process.env.PAYMENT_KEY_ID = "test"; process.env.PAYMENT_KEY_SECRET = "test";
    const evidence = { idempotencyKey: a.policy.checkoutAttempt.idempotencyKey, amount: 59900, currency: "INR", terminal: true, outcome: "not_created" };
    for (const invalid of [null, { ...evidence, terminal: false }, { ...evidence, idempotencyKey: "another-cart" }, { ...evidence, amount: 1 }]) {
      globalThis.fetch = async () => invalid ? Response.json(invalid) : new Response("", { status: 404 });
      assert.equal((await send(a.id)).status, 502); assert.equal(await stock(), 22);
    }
    globalThis.fetch = async () => Response.json(evidence);
    const responses = await Promise.all([send(a.id), send(a.id)]);
    assert.ok(responses.some(r => r.status === 200));
    assert.equal(await stock(), 23); assert.equal((await send(a.id)).status, 200);
    assert.equal((await repo.getAuditBundle(a.id, "test-store")).events.filter(e => e.title === "Reservation released").length, 1);
    const b = await pending("IC-created");
    globalThis.fetch = async () => Response.json({ ...evidence, idempotencyKey: b.policy.checkoutAttempt.idempotencyKey, outcome: "created", orderId: "provider-recovered" });
    assert.equal((await send(b.id)).status, 200); assert.equal((await send(b.id)).status, 200); assert.equal(await stock(), 22);
    assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM orders").first()).count, 1);
    // Completion and release race: one transaction wins, the other must have no effects.
    const c = await pending("IC-race"); const before = await stock();
    const results = await Promise.allSettled([
      recovery.releaseReservation(c, "terminal test evidence"),
      repo.completeOrder(c, { id: "race-order", sessionId: c.id, providerOrderId: "race-provider", amount: c.total, currency: "INR", status: "created", mode: "test", idempotencyKey: c.policy.checkoutAttempt.idempotencyKey, createdAt: new Date().toISOString() }, []),
    ]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    const resolved = await repo.getSession(c.id, "test-store");
    assert.equal(await stock(), resolved.status === "cancelled" ? before + 1 : before);
    const local = await pending("IC-local", "local_test");
    globalThis.fetch = async () => { throw new Error("Must not contact provider for a local test"); };
    assert.equal((await send(local.id)).status, 200);
  } finally {
    globalThis.fetch = originalFetch; for (const name of names) { if (env[name] === undefined) delete process.env[name]; else process.env[name] = env[name]; }
    delete globalThis.__INTENTCART_DB__; db.close(); await vite.close();
  }
});
