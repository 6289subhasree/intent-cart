import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { createD1, testRequest } from "./helpers/d1.mjs";

test("experiment is opt-in, stable, deduplicated, server-attributed and admin-only", async () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const vite = await createServer({ configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true, hmr: false } });
  const db = createD1(); globalThis.__INTENTCART_DB__ = db;
  const names = ["INTENTCART_AB_ENABLED", "INTENTCART_AB_ADMIN_USERS", "INTENTCART_AB_EXCLUDED_USERS", "GEMINI_API_KEY", "OPENAI_API_KEY", "PAYMENT_ORDER_API_URL", "PAYMENT_KEY_ID", "PAYMENT_KEY_SECRET"];
  const env = Object.fromEntries(names.map(n => [n, process.env[n]])); names.forEach(n => delete process.env[n]);
  try {
    const experiment = await vite.ssrLoadModule("/app/api/experiment/route.ts"); const results = await vite.ssrLoadModule("/app/api/experiment/results/route.ts");
    const agent = await vite.ssrLoadModule("/app/api/agent/route.ts"); const checkout = await vite.ssrLoadModule("/app/api/checkout/route.ts");
    const get = () => experiment.GET(testRequest(undefined, "/api/experiment", "GET"));
    assert.equal((await (await get()).json()).enabled, false);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM experiment_assignments").first()).n, 0);
    process.env.INTENTCART_AB_ENABLED = "true";
    const [a, b] = await Promise.all([get(), get()]);
    const assignment = await a.json(); assert.equal(assignment.variant, (await b.json()).variant); assert.ok(["A", "B"].includes(assignment.variant));
    const snapshot = () => db.prepare("SELECT * FROM experiment_assignments WHERE merchant_id = 'test-owner'").first();
    assert.equal((await snapshot()).exposed_at, null);
    assert.equal((await experiment.POST(testRequest({ variant: "B" }))).status, 400);
    assert.equal((await experiment.POST(new Request("http://localhost/api/experiment", { method: "POST", headers: { "Content-Type": "application/json", origin: "https://other.example" }, body: "{}" }))).status, 403);
    await experiment.POST(testRequest({})); const exposure = (await snapshot()).exposed_at;
    await experiment.POST(testRequest({})); assert.equal((await snapshot()).exposed_at, exposure);
    const cart = await (await agent.POST(testRequest({ intent: "Only sunscreen under 600" }))).json();
    assert.equal((await snapshot()).session_id, cart.id);
    await agent.POST(testRequest({ intent: "Only sunscreen under 600" })); assert.equal((await snapshot()).session_id, cart.id);
    const body = { sessionId: cart.id, cartVersion: cart.cartVersion, approval: true };
    assert.equal((await checkout.POST(testRequest(body))).status, 200); const orderedAt = (await snapshot()).ordered_at;
    assert.ok(orderedAt); await checkout.POST(testRequest(body)); assert.equal((await snapshot()).ordered_at, orderedAt);
    const result = () => results.GET(testRequest(undefined, "/api/experiment/results", "GET"));
    assert.equal((await result()).status, 403);
    process.env.INTENTCART_AB_ADMIN_USERS = "test_owner";
    let report = await (await result()).json(); assert.equal(report.variants.find(v => v.variant === assignment.variant).mature, 0);
    const old = Date.now() - 90000000;
    await db.prepare("UPDATE experiment_assignments SET exposed_at = ?, converted_at = ?, ordered_at = ?").bind(old, old + 1000, old + 2000).run();
    report = await (await result()).json(); const row = report.variants.find(v => v.variant === assignment.variant);
    assert.equal(row.mature, 1); assert.equal(row.converted, 1); assert.equal(row.ordered, 1);
    assert.ok(!JSON.stringify(report).includes("test-owner"));
    process.env.INTENTCART_AB_EXCLUDED_USERS = "test_owner"; assert.equal((await (await get()).json()).enabled, false);
    delete process.env.INTENTCART_AB_EXCLUDED_USERS;
    await db.prepare("DELETE FROM experiment_assignments").run();
    assert.equal((await (await get()).json()).enabled, false, "existing cart builders cannot enter a first-cart experiment");
  } finally { for (const name of names) { if (env[name] === undefined) delete process.env[name]; else process.env[name] = env[name]; } delete globalThis.__INTENTCART_DB__; db.close(); await vite.close(); }
});
