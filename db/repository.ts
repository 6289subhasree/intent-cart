import type { CartLine, PolicyResult } from "@/lib/commerce";

type Statement = {
  bind: (...values: unknown[]) => Statement;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  all: <T = Record<string, unknown>>() => Promise<{ results: T[] }>;
  run: () => Promise<unknown>;
};

type Database = {
  prepare: (query: string) => Statement;
  batch: (statements: Statement[]) => Promise<unknown[]>;
};

export type SessionStatus = "ready" | "blocked" | "approved" | "ordered";

export type StoredSession = {
  id: string;
  intent: string;
  title: string;
  mode: string;
  status: SessionStatus;
  budget: number;
  total: number;
  currency: string;
  cartVersion: string;
  fitScore: number;
  cart: CartLine[];
  policy: PolicyResult;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  orderId: string | null;
};

export type AuditEventInput = {
  type: string;
  state: "complete" | "failure" | "repair" | "waiting";
  title: string;
  detail: string;
  metadata?: Record<string, unknown>;
};

export type AuditEvent = AuditEventInput & {
  id: string;
  sequence: number;
  createdAt: string;
};

async function database() {
  const injected = (globalThis as typeof globalThis & { __INTENTCART_DB__?: Database }).__INTENTCART_DB__;
  if (injected) return injected;
  const { env } = await import("cloudflare:workers");
  const db = (env as unknown as { DB?: Database }).DB;
  if (!db) throw new Error("Persistent session storage is unavailable.");
  return db;
}

function eventStatement(db: Database, sessionId: string, sequence: number, event: AuditEventInput, createdAt: string) {
  return db.prepare(`INSERT INTO audit_events (id, session_id, sequence, type, state, title, detail, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    crypto.randomUUID(), sessionId, sequence, event.type, event.state, event.title, event.detail,
    JSON.stringify(event.metadata ?? {}), createdAt,
  );
}

function rowToSession(row: Record<string, unknown>): StoredSession {
  return {
    id: String(row.id), intent: String(row.intent), title: String(row.title), mode: String(row.mode),
    status: String(row.status) as SessionStatus, budget: Number(row.budget), total: Number(row.total),
    currency: String(row.currency), cartVersion: String(row.cart_version), fitScore: Number(row.fit_score) / 100,
    cart: JSON.parse(String(row.cart_json)), policy: JSON.parse(String(row.policy_json)),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    approvedAt: row.approved_at ? String(row.approved_at) : null, orderId: row.order_id ? String(row.order_id) : null,
  };
}

export async function createSession(session: StoredSession, events: AuditEventInput[]) {
  const db = await database();
  const statements = [
    db.prepare(`INSERT INTO shopping_sessions
      (id, intent, title, mode, status, budget, total, currency, cart_version, fit_score, cart_json, policy_json, created_at, updated_at, approved_at, order_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      session.id, session.intent, session.title, session.mode, session.status, session.budget, session.total,
      session.currency, session.cartVersion, Math.round(session.fitScore * 100), JSON.stringify(session.cart),
      JSON.stringify(session.policy), session.createdAt, session.updatedAt, session.approvedAt, session.orderId,
    ),
    ...events.map((event, index) => eventStatement(db, session.id, index + 1, event, session.createdAt)),
  ];
  await db.batch(statements);
}

export async function getSession(id: string) {
  const row = await (await database()).prepare("SELECT * FROM shopping_sessions WHERE id = ?").bind(id).first();
  return row ? rowToSession(row) : null;
}

export async function updateSession(session: StoredSession, events: AuditEventInput[] = []) {
  const db = await database();
  const sequenceRow = await db.prepare("SELECT COALESCE(MAX(sequence), 0) AS value FROM audit_events WHERE session_id = ?").bind(session.id).first<{ value: number }>();
  const start = Number(sequenceRow?.value ?? 0);
  await db.batch([
    db.prepare(`UPDATE shopping_sessions SET title = ?, mode = ?, status = ?, budget = ?, total = ?, currency = ?, cart_version = ?,
      fit_score = ?, cart_json = ?, policy_json = ?, updated_at = ?, approved_at = ?, order_id = ? WHERE id = ?`).bind(
      session.title, session.mode, session.status, session.budget, session.total, session.currency, session.cartVersion,
      Math.round(session.fitScore * 100), JSON.stringify(session.cart), JSON.stringify(session.policy), session.updatedAt,
      session.approvedAt, session.orderId, session.id,
    ),
    ...events.map((event, index) => eventStatement(db, session.id, start + index + 1, event, session.updatedAt)),
  ]);
}

export async function completeOrder(session: StoredSession, order: { id: string; sessionId: string; providerOrderId: string; amount: number; currency: string; status: string; mode: string; idempotencyKey: string; createdAt: string }, events: AuditEventInput[]) {
  const db = await database();
  const sequenceRow = await db.prepare("SELECT COALESCE(MAX(sequence), 0) AS value FROM audit_events WHERE session_id = ?").bind(session.id).first<{ value: number }>();
  const start = Number(sequenceRow?.value ?? 0);
  await db.batch([
    db.prepare(`INSERT INTO orders (id, session_id, provider_order_id, amount, currency, status, mode, idempotency_key, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(order.id, order.sessionId, order.providerOrderId, order.amount, order.currency, order.status, order.mode, order.idempotencyKey, order.createdAt),
    db.prepare(`UPDATE shopping_sessions SET status = ?, total = ?, policy_json = ?, updated_at = ?, approved_at = ?, order_id = ? WHERE id = ?`).bind(
      session.status, session.total, JSON.stringify(session.policy), session.updatedAt, session.approvedAt, session.orderId, session.id,
    ),
    ...events.map((event, index) => eventStatement(db, session.id, start + index + 1, event, session.updatedAt)),
  ]);
}

export async function getAuditBundle(sessionId?: string | null) {
  const db = await database();
  const row = sessionId
    ? await db.prepare("SELECT * FROM shopping_sessions WHERE id = ?").bind(sessionId).first()
    : await db.prepare("SELECT * FROM shopping_sessions ORDER BY created_at DESC LIMIT 1").first();
  if (!row) return null;
  const session = rowToSession(row);
  const result = await db.prepare("SELECT * FROM audit_events WHERE session_id = ? ORDER BY sequence ASC").bind(session.id).all<Record<string, unknown>>();
  const events: AuditEvent[] = result.results.map((event) => ({
    id: String(event.id), sequence: Number(event.sequence), type: String(event.type), state: String(event.state) as AuditEvent["state"],
    title: String(event.title), detail: String(event.detail), metadata: JSON.parse(String(event.metadata_json)), createdAt: String(event.created_at),
  }));
  return { session, events };
}

export async function getMerchantSnapshot() {
  const db = await database();
  const summary = await db.prepare(`SELECT COUNT(*) AS sessions,
    SUM(CASE WHEN status = 'ordered' THEN 1 ELSE 0 END) AS converted,
    SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) AS blocked,
    COALESCE(SUM(CASE WHEN status = 'ordered' THEN total ELSE 0 END), 0) AS revenue,
    COALESCE(AVG(CASE WHEN status = 'ordered' THEN total END), 0) AS aov
    FROM shopping_sessions`).first<Record<string, unknown>>();
  const rows = await db.prepare("SELECT * FROM shopping_sessions ORDER BY created_at DESC LIMIT 8").all<Record<string, unknown>>();
  const sessions = rows.results.map(rowToSession);
  return {
    sessions: Number(summary?.sessions ?? 0), converted: Number(summary?.converted ?? 0), blocked: Number(summary?.blocked ?? 0),
    revenue: Number(summary?.revenue ?? 0), aov: Math.round(Number(summary?.aov ?? 0)), recent: sessions,
  };
}
