import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { createD1 } from "./helpers/d1.mjs";

async function setup() {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const vite = await createServer({ configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true, hmr: false } });
  const db = createD1(); globalThis.__INTENTCART_DB__ = db;
  const routes = {};
  for (const path of ["auth/register", "auth/login", "auth/logout", "auth/me", "auth/password", "auth/recovery-code", "auth/reset", "catalogue", "agent", "cart", "checkout", "audit", "merchant"]) routes[path] = await vite.ssrLoadModule(`/app/api/${path}/route.ts`);
  const send = (path, { method = "GET", cookie = "", body, origin = "http://localhost", url = "http://localhost", headers = {} } = {}) => {
    const route = path.split("?")[0];
    return routes[route][method](new Request(`${url}/api/${path}`, { method, headers: { "Content-Type": "application/json", origin, cookie, ...headers }, ...(method !== "GET" ? { body: JSON.stringify(body ?? {}) } : {}) }));
  };
  const register = async (username) => {
    const response = await send("auth/register", { method: "POST", body: { username, password: "Long test password 123!", storeName: `${username} store` } });
    assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
    const raw = response.headers.get("set-cookie"); assert.match(raw, /HttpOnly/); assert.match(raw, /SameSite=Strict/);
    return raw.split(";")[0];
  };
  return { db, send, register, close: async () => { delete globalThis.__INTENTCART_DB__; db.close(); await vite.close(); } };
}

test("two merchants have separate catalogues, sessions, orders and audit exports", async () => {
  const app = await setup();
  const keys = [process.env.GEMINI_API_KEY, process.env.OPENAI_API_KEY];
  delete process.env.GEMINI_API_KEY; delete process.env.OPENAI_API_KEY;
  try {
    const alice = await app.register("alice"); const bob = await app.register("bob");
    for (const path of ["auth/me", "catalogue", "audit", "merchant"]) assert.equal((await app.send(path)).status, 401);
    for (const path of ["agent", "cart", "checkout"]) assert.equal((await app.send(path, { method: "POST" })).status, 401);
    const aliceMe = await (await app.send("auth/me", { cookie: alice })).json();
    const bobMe = await (await app.send("auth/me", { cookie: bob })).json();
    assert.notEqual(aliceMe.storeId, bobMe.storeId);
    const cart = await (await app.send("agent", { method: "POST", cookie: alice, body: { intent: "Only sunscreen under ₹600", storeId: bobMe.storeId } })).json();
    assert.equal(cart.storeId, aliceMe.storeId);
    assert.equal((await app.send(`audit?sessionId=${cart.id}`, { cookie: bob })).status, 404);
    assert.equal((await app.send("audit", { cookie: bob })).status, 404);
    assert.equal((await app.send("cart", { method: "POST", cookie: bob, body: { sessionId: cart.id, cartVersion: cart.cartVersion, action: "conflict" } })).status, 404);
    assert.equal((await app.send("checkout", { method: "POST", cookie: bob, body: { sessionId: cart.id, cartVersion: cart.cartVersion, approval: true } })).status, 404);
    const ownAudit = await app.send(`audit?sessionId=${cart.id}`, { cookie: alice });
    assert.equal(ownAudit.status, 200); assert.equal(ownAudit.headers.get("cache-control"), "no-store");
    const catalogue = await (await app.send("catalogue", { cookie: alice })).json();
    const changed = { version: catalogue.version, products: catalogue.products.map((item) => item.id === "sku_spf_07" ? { ...item, price: 49900 } : item) };
    assert.equal((await app.send("catalogue", { method: "PUT", cookie: bob, body: changed })).status, 409);
    assert.equal((await app.send("catalogue", { method: "PUT", cookie: alice, body: changed })).status, 200);
    assert.equal((await app.send("catalogue", { method: "PUT", cookie: alice, body: changed })).status, 409);
    assert.equal((await (await app.send("catalogue", { cookie: bob })).json()).products.find((item) => item.id === "sku_spf_07").price, 59900);
    assert.equal((await app.send("checkout", { method: "POST", cookie: alice, body: { sessionId: cart.id, cartVersion: cart.cartVersion, approval: true } })).status, 409);
    const cheap = await (await app.send("agent", { method: "POST", cookie: alice, body: { intent: "Only sunscreen under ₹500" } })).json();
    assert.equal(cheap.total, 49900);
    assert.equal((await app.send("agent", { method: "POST", cookie: bob, body: { intent: "Only sunscreen under ₹500" } })).status, 422);
    assert.equal((await app.send("checkout", { method: "POST", cookie: alice, body: { sessionId: cheap.id, cartVersion: cheap.cartVersion, approval: true } })).status, 200);
    const aMetrics = await (await app.send("merchant", { cookie: alice })).json();
    const bMetrics = await (await app.send("merchant", { cookie: bob })).json();
    assert.equal(aMetrics.converted, 1); assert.equal(aMetrics.revenue, 49900); assert.equal(bMetrics.sessions, 0); assert.equal(bMetrics.revenue, 0);
    assert.equal((await (await app.send("audit", { cookie: alice })).json()).session.id, cheap.id);
    // Legacy sessions are preserved but never assigned to the first registrant.
    await app.db.prepare("UPDATE shopping_sessions SET store_id = NULL WHERE id = ?").bind(cart.id).run();
    assert.equal((await app.send(`audit?sessionId=${cart.id}`, { cookie: alice })).status, 404);
  } finally {
    for (const [index, key] of ["GEMINI_API_KEY", "OPENAI_API_KEY"].entries()) { if (keys[index] === undefined) delete process.env[key]; else process.env[key] = keys[index]; }
    await app.close();
  }
});

test("authentication validates passwords, revokes sessions and rejects forged or expired cookies", async () => {
  const app = await setup();
  try {
    const cookie = await app.register("owner");
    const auth = await (await app.send("auth/me", { cookie })).json();
    const row = await app.db.prepare("SELECT password_hash FROM merchants WHERE username = 'owner'").first();
    assert.match(row.password_hash, /^pbkdf2-sha256\$600000\$/);
    assert.ok(!row.password_hash.includes("Long test password"));
    const stored = await app.db.prepare("SELECT token_hash FROM auth_sessions WHERE merchant_id = (SELECT id FROM merchants WHERE username = 'owner')").first();
    assert.ok(!cookie.includes(stored.token_hash));
    assert.equal((await app.send("auth/me", { cookie: "intentcart_session=" + "b".repeat(64) })).status, 401);
    assert.equal((await app.send("auth/login", { method: "POST", body: { username: "owner", password: "incorrect" } })).status, 401);
    const login = await app.send("auth/login", { method: "POST", url: "https://localhost", origin: "https://localhost", body: { username: "OWNER", password: "Long test password 123!" } });
    assert.equal(login.status, 200); assert.match(login.headers.get("set-cookie"), /; Secure/);
    const second = login.headers.get("set-cookie").split(";")[0]; assert.notEqual(second, cookie);
    const changed = await app.send("auth/password", { method: "POST", cookie, body: { currentPassword: "Long test password 123!", newPassword: "Another long password 456!" } });
    assert.equal(changed.status, 200);
    const renewed = changed.headers.get("set-cookie").split(";")[0];
    assert.equal((await app.send("auth/me", { cookie })).status, 401);
    assert.equal((await app.send("auth/me", { cookie: second })).status, 401);
    assert.equal((await (await app.send("auth/me", { cookie: renewed })).json()).storeId, auth.storeId);
    assert.equal((await app.send("auth/logout", { method: "POST", cookie: renewed })).status, 200);
    assert.equal((await app.send("auth/me", { cookie: renewed })).status, 401);
    const signedIn = await app.send("auth/login", { method: "POST", body: { username: "owner", password: "Another long password 456!" } });
    assert.equal(signedIn.status, 200);
    await app.db.prepare("UPDATE auth_sessions SET expires_at = 0").run();
    assert.equal((await app.send("auth/me", { cookie: signedIn.headers.get("set-cookie").split(";")[0] })).status, 401);
  } finally { await app.close(); }
});

test("mutations require a matching origin, bounded bodies and limited sign-in attempts", async () => {
  const app = await setup();
  try {
    const cookie = await app.register("csrf_owner");
    for (const [path, method] of [["auth/reset", "POST"], ["auth/recovery-code", "POST"], ["agent", "POST"], ["cart", "POST"], ["checkout", "POST"], ["catalogue", "PUT"], ["auth/logout", "POST"], ["auth/password", "POST"], ["auth/login", "POST"], ["auth/register", "POST"]]) {
      assert.equal((await app.send(path, { method, cookie, origin: "https://attacker.invalid" })).status, 403, path);
      assert.equal((await app.send(path, { method, cookie, origin: "" })).status, 403, path);
    }
    assert.equal((await app.send("agent", { method: "POST", cookie, body: { intent: "x".repeat(20000) } })).status, 413);
    for (let i = 0; i < 8; i++) assert.equal((await app.send("auth/login", { method: "POST", body: { username: "not_a_user", password: "wrong" } })).status, 401);
    assert.equal((await app.send("auth/login", { method: "POST", body: { username: "not_a_user", password: "wrong" } })).status, 429);
  } finally { await app.close(); }
});

test("recovery codes are hashed, rotated, consumed once and revoke all sessions", async () => {
  const app = await setup();
  try {
    const signup = await app.send("auth/register", { method: "POST", body: { username: "recover_owner", password: "Long test password 123!", storeName: "Recovery store" } });
    assert.equal(signup.status, 201);
    const initial = (await signup.json()).recoveryCode;
    assert.match(initial, /^[a-f0-9]{64}$/);
    assert.equal(signup.headers.get("cache-control"), "no-store");
    const cookie = signup.headers.get("set-cookie").split(";")[0];
    const row = await app.db.prepare("SELECT recovery_hash FROM merchants WHERE username = 'recover_owner'").first();
    assert.notEqual(row.recovery_hash, initial);
    const rotate = (password) => app.send("auth/recovery-code", { method: "POST", cookie, body: { currentPassword: password } });
    assert.equal((await rotate("wrong")).status, 403);
    const rotation = await rotate("Long test password 123!");
    assert.equal(rotation.status, 200);
    const code = (await rotation.json()).recoveryCode;
    assert.notEqual(code, initial);
    const reset = (recoveryCode, username = "recover_owner") => app.send("auth/reset", { method: "POST", body: { username, recoveryCode, newPassword: "My replacement password 456!" } });
    assert.equal((await reset(initial)).status, 400);
    assert.equal((await reset(code, "someone_else")).status, 400);
    const login = await app.send("auth/login", { method: "POST", body: { username: "recover_owner", password: "Long test password 123!" } });
    const second = login.headers.get("set-cookie").split(";")[0];
    const concurrent = await Promise.all([reset(code), reset(code)]);
    assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 400]);
    assert.equal((await reset(code)).status, 400);
    for (const session of [cookie, second]) assert.equal((await app.send("auth/me", { cookie: session })).status, 401);
    assert.equal((await app.db.prepare("SELECT recovery_hash FROM merchants WHERE username = 'recover_owner'").first()).recovery_hash, null);
    assert.equal((await app.send("auth/login", { method: "POST", body: { username: "recover_owner", password: "Long test password 123!" } })).status, 401);
    assert.equal((await app.send("auth/login", { method: "POST", body: { username: "recover_owner", password: "My replacement password 456!" } })).status, 200);
  } finally { await app.close(); }
});

test("recovery rejects oversized requests and rate limits guessing without changing credentials", async () => {
  const app = await setup();
  try {
    const cookie = await app.register("limited_owner");
    assert.equal((await app.send("auth/reset", { method: "POST", body: { recoveryCode: "a".repeat(20000) } })).status, 413);
    for (let i = 0; i < 5; i++) assert.equal((await app.send("auth/reset", { method: "POST", body: { username: "limited_owner", recoveryCode: "a".repeat(64), newPassword: "Another test password!" } })).status, 400);
    assert.equal((await app.send("auth/reset", { method: "POST", body: { username: "limited_owner", recoveryCode: "a".repeat(64), newPassword: "Another test password!" } })).status, 429);
    assert.equal((await app.send("auth/me", { cookie })).status, 200);
    assert.equal((await app.send("auth/recovery-code", { method: "POST", body: { currentPassword: "Long test password 123!" } })).status, 401);
  } finally { await app.close(); }
});
