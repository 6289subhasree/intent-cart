import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

import { createD1 } from "./helpers/d1.mjs";

async function worker(db) {
  globalThis.__INTENTCART_DB__ = db;
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

const ctx = { waitUntil() {}, passThroughOnException() {} };

test("Gemini recommendations are validated and provider failures fall back", async () => {
  const db = createD1();
  globalThis.__INTENTCART_DB__ = db;
  const root = fileURLToPath(new URL("..", import.meta.url));
  const vite = await createServer({ configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true, hmr: false } });
  const route = await vite.ssrLoadModule("/app/api/agent/route.ts");
  const run = async () => (await route.POST({ json: async () => ({ intent: "Choose a gentle cleanser under INR 2000" }) })).json();
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  try {
    globalThis.fetch = async (url, options) => {
      assert.match(String(url), /generativelanguage.googleapis.com/);
      assert.equal(options.headers["x-goog-api-key"], "test-key");
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ cart: ["sku_cleanser_01"], title: "Gentle cleanser", fitScore: 0.9 }) }] } }] });
    };
    const result = await run();
    assert.equal(result.mode, "ai");
    assert.equal(result.total, 54900);
    globalThis.fetch = async () => new Response("Quota exceeded", { status: 429 });
    const fallback = await run();
    assert.equal(fallback.mode, "deterministic_fallback");
    assert.equal(fallback.degradedGracefully, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    db.close();
    await vite.close();
  }
});

async function request(app, db, path, body, method = "POST") {
  return app.fetch(new Request(`http://localhost${path}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }), { DB: db, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, ctx);
}

async function session(app, db) {
  const response = await request(app, db, "/api/agent", { intent: "Build a sensitive-skin gift under ₹2,000 and deliver it before Friday." });
  assert.equal(response.status, 200);
  return response.json();
}

test("recommendation response creates a persisted, server-priced cart", async () => {
  const db = createD1(); const app = await worker(db);
  const result = await session(app, db);
  assert.equal(result.items.length, 3);
  assert.equal(result.total, 189700);
  assert.equal(result.policy.passed, true);
  const audit = await request(app, db, `/api/audit?sessionId=${result.id}`, null, "GET");
  assert.equal(audit.status, 200);
  assert.equal((await audit.json()).events.length, 4);
  db.close();
});

test("checkout rejects missing approval and a stale cart version", async () => {
  const db = createD1(); const app = await worker(db); const cart = await session(app, db);
  const noApproval = await request(app, db, "/api/checkout", { sessionId: cart.id, cartVersion: cart.cartVersion, approval: false });
  assert.equal(noApproval.status, 400);
  const changed = await request(app, db, "/api/cart", { sessionId: cart.id, cartVersion: cart.cartVersion, action: "update", items: cart.items.map((item) => ({ productId: item.id, quantity: item.quantity })) });
  assert.equal(changed.status, 200);
  const stale = await request(app, db, "/api/checkout", { sessionId: cart.id, cartVersion: cart.cartVersion, approval: true });
  assert.equal(stale.status, 409);
  assert.match((await stale.json()).error, /stale/i);
  db.close();
});

test("server blocks an over-budget edit before checkout", async () => {
  const db = createD1(); const app = await worker(db); const cart = await session(app, db);
  const response = await request(app, db, "/api/cart", { sessionId: cart.id, cartVersion: cart.cartVersion, action: "update", items: cart.items.map((item) => ({ productId: item.id, quantity: 3 })) });
  assert.equal(response.status, 200);
  const blocked = await response.json();
  assert.equal(blocked.policy.withinBudget, false);
  assert.equal(blocked.status, "blocked");
  const checkout = await request(app, db, "/api/checkout", { sessionId: blocked.id, cartVersion: blocked.cartVersion, approval: true });
  assert.equal(checkout.status, 409);
  db.close();
});

test("inventory failure, repair, approval and dashboard data share one trace", async () => {
  const db = createD1(); const app = await worker(db); const cart = await session(app, db);
  const conflictResponse = await request(app, db, "/api/cart", { sessionId: cart.id, cartVersion: cart.cartVersion, action: "conflict", items: cart.items.map((item) => ({ productId: item.id, quantity: item.quantity })) });
  const conflict = await conflictResponse.json();
  assert.equal(conflict.policy.stockValid, false);
  const blockedCheckout = await request(app, db, "/api/checkout", { sessionId: conflict.id, cartVersion: conflict.cartVersion, approval: true });
  assert.equal(blockedCheckout.status, 409);
  const repairResponse = await request(app, db, "/api/cart", { sessionId: conflict.id, cartVersion: conflict.cartVersion, action: "repair" });
  const repaired = await repairResponse.json();
  assert.equal(repaired.policy.passed, true);
  assert.ok(repaired.items.some((item) => item.id === "sku_barrier_02"));
  const checkout = await request(app, db, "/api/checkout", { sessionId: repaired.id, cartVersion: repaired.cartVersion, approval: true });
  assert.equal(checkout.status, 200);
  const order = await checkout.json();
  const repeated = await request(app, db, "/api/checkout", { sessionId: repaired.id, cartVersion: repaired.cartVersion, approval: true });
  assert.equal(repeated.status, 200);
  assert.equal((await repeated.json()).id, order.id);
  const audit = await request(app, db, `/api/audit?sessionId=${cart.id}`, null, "GET");
  const trace = await audit.json();
  assert.ok(trace.events.some((event) => event.type === "INVENTORY"));
  assert.ok(trace.events.some((event) => event.type === "MONEY"));
  const merchant = await request(app, db, "/api/merchant", null, "GET");
  const metrics = await merchant.json();
  assert.equal(metrics.sessions, 1);
  assert.equal(metrics.converted, 1);
  assert.equal(metrics.revenue, 189700);
  db.close();
});
