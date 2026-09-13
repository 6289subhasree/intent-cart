import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { createD1 } from "./helpers/d1.mjs";

test("durable checkout claim prevents concurrent provider calls, edits and uncertain retries", async () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const vite = await createServer({ configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true, hmr: false } });
  const agent = await vite.ssrLoadModule("/app/api/agent/route.ts");
  const cartRoute = await vite.ssrLoadModule("/app/api/cart/route.ts");
  const checkout = await vite.ssrLoadModule("/app/api/checkout/route.ts");
  const repo = await vite.ssrLoadModule("/db/repository.ts");
  const originalFetch = globalThis.fetch;
  const envNames = ["GEMINI_API_KEY", "OPENAI_API_KEY", "PAYMENT_ORDER_API_URL", "PAYMENT_KEY_ID", "PAYMENT_KEY_SECRET"];
  const originalEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  const post = (route, body) => route.POST({ json: async () => body });
  try {
    delete process.env.GEMINI_API_KEY; delete process.env.OPENAI_API_KEY;
    process.env.PAYMENT_ORDER_API_URL = "https://orders.example.test/orders";
    process.env.PAYMENT_KEY_ID = "test"; process.env.PAYMENT_KEY_SECRET = "test";
    for (const outcome of ["success", "timeout", "invalid", "save-failure"]) {
      const db = createD1(); globalThis.__INTENTCART_DB__ = db;
      try {
        const cart = await (await post(agent, { intent: "Only sunscreen under ₹600" })).json();
        const body = { sessionId: cart.id, cartVersion: cart.cartVersion, approval: true };
        let calls = 0; let release; let entered;
        const gate = new Promise((resolve) => { release = resolve; });
        const started = new Promise((resolve) => { entered = resolve; });
        globalThis.fetch = async () => {
          calls++; entered(); await gate;
          if (outcome === "timeout") throw new DOMException("Timeout", "TimeoutError");
          return Response.json({ id: "provider-order-1", amount: outcome === "invalid" ? 1 : 59900, currency: "INR", status: "created" });
        };
        if (outcome === "save-failure") {
          const batch = db.batch;
          db.batch = (statements) => {
            if (statements[0].sql.includes("INSERT INTO orders")) throw new Error("Database unavailable after provider success");
            return batch(statements);
          };
        }
        const first = post(checkout, body);
        await started;
        assert.equal((await post(checkout, body)).status, 409);
        assert.equal((await post(cartRoute, { sessionId: cart.id, cartVersion: cart.cartVersion, action: "update", items: [] })).status, 409);
        const pending = await repo.getSession(cart.id);
        assert.equal(pending.status, "approved");
        assert.equal(pending.policy.checkoutAttempt.state, "pending");
        release();
        assert.equal((await first).status, outcome === "success" ? 200 : 502);
        assert.equal((await post(checkout, body)).status, outcome === "success" ? 200 : 409);
        assert.equal(calls, 1, outcome);
        const trace = await repo.getAuditBundle(cart.id);
        assert.equal(trace.events.filter((event) => event.title === "Buyer approved exact cart and amount").length, 1);
        assert.deepEqual(trace.events.map((event) => event.sequence), trace.events.map((_, index) => index + 1));
        assert.equal(trace.session.status, outcome === "success" ? "ordered" : "approved");
        if (outcome !== "success") assert.equal(trace.session.policy.checkoutAttempt.state, "unknown");
        if (outcome === "save-failure") assert.equal(trace.session.policy.checkoutAttempt.providerOrderId, "provider-order-1");
      } finally { db.close(); }
    }
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of envNames) { if (originalEnv[name] === undefined) delete process.env[name]; else process.env[name] = originalEnv[name]; }
    delete globalThis.__INTENTCART_DB__;
    await vite.close();
  }
});

test("cart writes compare versions atomically and inventory exclusions survive updates", async () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const vite = await createServer({ configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true, hmr: false } });
  const repo = await vite.ssrLoadModule("/db/repository.ts");
  const cartRoute = await vite.ssrLoadModule("/app/api/cart/route.ts");
  const commerce = await vite.ssrLoadModule("/lib/commerce.ts");
  const db = createD1(); globalThis.__INTENTCART_DB__ = db;
  const lines = [{ productId: "sku_spf_07", quantity: 1 }];
  const session = { id: "IC-concurrency", intent: "Only sunscreen under ₹2000", title: "Sunscreen", mode: "deterministic_fallback", status: "ready", budget: 200000, total: 59900, currency: "INR", cartVersion: "initial-version", fitScore: 0, cart: lines, policy: commerce.evaluateCart(lines), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), approvedAt: null, orderId: null };
  const post = (body) => cartRoute.POST({ json: async () => body });
  try {
    await repo.createSession(session, []);
    const writes = await Promise.all(["one", "two"].map((suffix) => repo.updateSession({ ...session, cartVersion: `version-${suffix}` }, [{ type: "BUYER", state: "complete", title: suffix, detail: suffix }], session.cartVersion)));
    assert.deepEqual(writes.sort(), [false, true]);
    let current = await repo.getSession(session.id);
    assert.equal((await repo.getAuditBundle(session.id)).events.length, 1);
    current = await (await post({ sessionId: current.id, cartVersion: current.cartVersion, action: "conflict" })).json();
    assert.deepEqual(current.policy.unavailableProductIds, ["sku_spf_07"]);
    current = await (await post({ sessionId: current.id, cartVersion: current.cartVersion, action: "update", items: lines })).json();
    assert.equal(current.policy.stockValid, false);
    assert.equal(current.status, "blocked");
    const repair = await post({ sessionId: current.id, cartVersion: current.cartVersion, action: "repair" });
    assert.equal(repair.status, 409);
    assert.equal((await repair.json()).code, "NO_REPLACEMENT");
    assert.deepEqual((await repo.getSession(session.id)).policy.unavailableProductIds, ["sku_spf_07"]);
    const winners = await Promise.all([
      repo.updateSession({ ...current, cartVersion: "last-edit" }, [], current.cartVersion),
      repo.claimCheckout({ ...current, status: "ready" }, "test-key"),
    ]);
    // Stored blocked state cannot be overridden by the caller's claimed status.
    assert.equal(winners[1], null);
    for (const reverse of [false, true]) {
      const fresh = { ...session, id: `IC-race-${reverse}`, cartVersion: `race-${reverse}` };
      await repo.createSession(fresh, []);
      const edit = () => repo.updateSession({ ...fresh, cartVersion: `edited-${reverse}` }, [], fresh.cartVersion);
      const approve = () => repo.claimCheckout(fresh, `key-${reverse}`);
      const actions = reverse ? [approve, edit] : [edit, approve];
      const results = await Promise.all(actions.map((action) => action()));
      assert.equal(results.filter(Boolean).length, 1);
      const saved = await repo.getSession(fresh.id);
      assert.ok(saved.status === "approved" || saved.cartVersion === `edited-${reverse}`);
    }
  } finally { db.close(); delete globalThis.__INTENTCART_DB__; await vite.close(); }
});
