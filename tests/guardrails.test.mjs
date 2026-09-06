import assert from "node:assert/strict";
import test from "node:test";

async function worker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  return (await import(workerUrl.href)).default;
}

const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const ctx = { waitUntil() {}, passThroughOnException() {} };

test("blocks checkout above the buyer-approved budget", async () => {
  const app = await worker();
  const response = await app.fetch(new Request("http://localhost/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ amount: 250000, approval: true, cartVersion: "IC-test" }),
  }), env, ctx);
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /blocked/i);
});

test("requires explicit approval", async () => {
  const app = await worker();
  const response = await app.fetch(new Request("http://localhost/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ amount: 189700, approval: false, cartVersion: "IC-test" }),
  }), env, ctx);
  assert.equal(response.status, 400);
});
