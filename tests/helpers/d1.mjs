import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

class D1Statement {
  constructor(database, sql, values = []) { this.database = database; this.sql = sql; this.values = values; }
  bind(...values) { return new D1Statement(this.database, this.sql, values); }
  async first() { return this.database.prepare(this.sql).get(...this.values) ?? null; }
  async all() { return { results: this.database.prepare(this.sql).all(...this.values) }; }
  async run() { return this.database.prepare(this.sql).run(...this.values); }
}

export function createD1() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  const folder = new URL("../../drizzle/", import.meta.url);
  for (const file of readdirSync(folder).filter((name) => name.endsWith(".sql")).sort()) database.exec(readFileSync(new URL(file, folder), "utf8").replaceAll("--> statement-breakpoint", ""));
  database.prepare("INSERT INTO merchants (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)").run("test-owner", "test_owner", "unused-test-fixture", new Date().toISOString());
  database.prepare("INSERT INTO stores (id, owner_id, name, catalogue_json, catalogue_version, created_at) VALUES (?, ?, ?, ?, ?, ?)").run("test-store", "test-owner", "Test Store", readFileSync(new URL("./catalogue.json", import.meta.url), "utf8"), "test-version", new Date().toISOString());
  database.prepare("INSERT INTO auth_sessions (token_hash, merchant_id, expires_at) VALUES (?, ?, ?)").run(createHash("sha256").update("a".repeat(64)).digest("hex"), "test-owner", Date.now() + 86400000);
  return {
    prepare(sql) { return new D1Statement(database, sql); },
    async batch(statements) { const results = []; database.exec("BEGIN"); try { for (const statement of statements) { const result = database.prepare(statement.sql).run(...statement.values); results.push({ meta: { changes: Number(result.changes) } }); } database.exec("COMMIT"); return results; } catch (error) { database.exec("ROLLBACK"); throw error; } },
    close() { database.close(); },
  };
}

export const authHeaders = { "content-type": "application/json", origin: "http://localhost", cookie: `intentcart_session=${"a".repeat(64)}` };
export function testRequest(body, path = "/api/test", method = "POST") {
  return new Request(`http://localhost${path}`, { method, headers: authHeaders, ...(method === "GET" ? {} : { body: JSON.stringify(body) }) });
}
