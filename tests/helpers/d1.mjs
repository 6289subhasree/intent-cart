import { readFileSync } from "node:fs";
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
  const migration = readFileSync(new URL("../../drizzle/0000_warm_viper.sql", import.meta.url), "utf8").replaceAll("--> statement-breakpoint", "");
  database.exec(migration);
  return {
    prepare(sql) { return new D1Statement(database, sql); },
    async batch(statements) { const results = []; database.exec("BEGIN"); try { for (const statement of statements) { const result = database.prepare(statement.sql).run(...statement.values); results.push({ meta: { changes: Number(result.changes) } }); } database.exec("COMMIT"); return results; } catch (error) { database.exec("ROLLBACK"); throw error; } },
    close() { database.close(); },
  };
}
