import type { CartLine, CatalogueProduct, PolicyResult } from "@/lib/commerce";

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

export type SessionStatus = "ready" | "blocked" | "approved" | "ordered" | "cancelled";

export type StoredSession = {
  id: string;
  storeId?: string | null;
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

export async function database() {
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
    id: String(row.id), storeId: row.store_id ? String(row.store_id) : null, intent: String(row.intent), title: String(row.title), mode: String(row.mode),
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
      (id, store_id, intent, title, mode, status, budget, total, currency, cart_version, fit_score, cart_json, policy_json, created_at, updated_at, approved_at, order_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      session.id, session.storeId ?? null, session.intent, session.title, session.mode, session.status, session.budget, session.total,
      session.currency, session.cartVersion, Math.round(session.fitScore * 100), JSON.stringify(session.cart),
      JSON.stringify(session.policy), session.createdAt, session.updatedAt, session.approvedAt, session.orderId,
    ),
    ...events.map((event, index) => eventStatement(db, session.id, index + 1, event, session.createdAt)),
  ];
  await db.batch(statements);
}

export async function getSession(id: string, storeId: string) {
  const row = await (await database()).prepare("SELECT * FROM shopping_sessions WHERE id = ? AND store_id = ?").bind(id, storeId).first();
  return row ? rowToSession(row) : null;
}

export async function updateSession(session: StoredSession, events: AuditEventInput[] = [], expectedVersion: string) {
  const db = await database();
  const results = await db.batch([
    db.prepare(`UPDATE shopping_sessions SET title = ?, mode = ?, status = ?, budget = ?, total = ?, currency = ?, cart_version = ?,
      fit_score = ?, cart_json = ?, policy_json = ?, updated_at = ?, approved_at = ?, order_id = ? WHERE id = ? AND cart_version = ? AND status IN ('ready', 'blocked') AND store_id IS ?`).bind(
      session.title, session.mode, session.status, session.budget, session.total, session.currency, session.cartVersion,
      Math.round(session.fitScore * 100), JSON.stringify(session.cart), JSON.stringify(session.policy), session.updatedAt,
      session.approvedAt, session.orderId, session.id, expectedVersion, session.storeId ?? null,
    ),
    ...events.map((event) => conditionalEvent(db, session, event, "cart_version = ?", session.cartVersion)),
  ]);
  return Number((results[0] as { meta: { changes: number } }).meta.changes) === 1;
}

export async function completeOrder(session: StoredSession, order: { id: string; sessionId: string; providerOrderId: string; amount: number; currency: string; status: string; mode: string; idempotencyKey: string; createdAt: string }, events: AuditEventInput[]) {
  const db = await database();
  const resolutionId = crypto.randomUUID();
  const policy = { ...session.policy, checkoutAttempt: { ...session.policy.checkoutAttempt!, state: "completed", resolutionId } };
  const results = await db.batch([
    db.prepare("UPDATE shopping_sessions SET status = 'ordered', total = ?, policy_json = ?, updated_at = ?, order_id = ? WHERE id = ? AND store_id = ? AND status = 'approved' AND json_extract(policy_json, '$.checkoutAttempt.id') = ?")
      .bind(session.total, JSON.stringify(policy), session.updatedAt, order.providerOrderId, session.id, session.storeId, session.policy.checkoutAttempt!.id),
    db.prepare(`INSERT INTO orders (id, session_id, provider_order_id, amount, currency, status, mode, idempotency_key, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM shopping_sessions WHERE id = ? AND json_extract(policy_json, '$.checkoutAttempt.resolutionId') = ?)`).bind(order.id, order.sessionId, order.providerOrderId, order.amount, order.currency, order.status, order.mode, order.idempotencyKey, order.createdAt, session.id, resolutionId),
    ...events.map(event => conditionalEvent(db, session, event, "json_extract(policy_json, '$.checkoutAttempt.resolutionId') = ?", resolutionId)),
  ]);
  if (Number((results[0] as { meta: { changes: number } }).meta.changes) !== 1) throw new Error("Checkout already resolved");
}
function conditionalEvent(db: Database, session: StoredSession, event: AuditEventInput, condition: string, value: string) {
  return db.prepare(`INSERT INTO audit_events (id, session_id, sequence, type, state, title, detail, metadata_json, created_at)
    SELECT ?, ?, (SELECT COALESCE(MAX(sequence), 0) + 1 FROM audit_events WHERE session_id = ?), ?, ?, ?, ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM shopping_sessions WHERE id = ? AND ${condition})`).bind(
      crypto.randomUUID(), session.id, session.id, event.type, event.state, event.title, event.detail,
      JSON.stringify(event.metadata ?? {}), session.updatedAt, session.id, value,
    );
}

// The durable approval claim is acquired before any provider request. A pending
// or uncertain claim is never automatically released or retried.
export async function claimCheckout(session: StoredSession, idempotencyKey: string, providerMode?: "local_test" | "external") {
  const db = await database();
  // Reserve available stock in the same transaction as the approval claim.
  // Catalogue version comparison makes competing carts and editor saves exclusive.
  if (!session.storeId) return null;
  const store = await db.prepare("SELECT catalogue_json, catalogue_version FROM stores WHERE id = ?").bind(session.storeId).first();
  if (!store || store.catalogue_version !== session.policy.catalogueVersion) return null;
  const products = JSON.parse(String(store.catalogue_json)) as CatalogueProduct[];
  const quantities = new Map<string, number>();
  for (const line of session.cart) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) return null;
    quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.quantity);
  }
  if (!quantities.size || [...quantities].some(([id, quantity]) => !products.some((product) => product.id === id && product.stock >= quantity))) return null;
  const reserved = products.map((product) => ({ ...product, stock: product.stock - (quantities.get(product.id) ?? 0) }));
  const attempt = { id: crypto.randomUUID(), state: "pending" as const, idempotencyKey, providerMode };
  const now = new Date().toISOString();
  const next = { ...session, status: "approved" as const, approvedAt: now, updatedAt: now, policy: { ...session.policy, checkoutAttempt: attempt } };
  const result = await db.batch([
    db.prepare("UPDATE shopping_sessions SET status = 'approved', approved_at = ?, updated_at = ?, policy_json = ? WHERE id = ? AND cart_version = ? AND status = 'ready' AND store_id IS ? AND (store_id IS NULL OR EXISTS (SELECT 1 FROM stores WHERE stores.id = shopping_sessions.store_id AND catalogue_version = ?))")
      .bind(now, now, JSON.stringify(next.policy), session.id, session.cartVersion, session.storeId ?? null, session.policy.catalogueVersion ?? null),
    db.prepare("UPDATE stores SET catalogue_json = ?, catalogue_version = ? WHERE id = ? AND EXISTS (SELECT 1 FROM shopping_sessions WHERE id = ? AND status = 'approved' AND json_extract(policy_json, '$.checkoutAttempt.id') = ?)")
      .bind(JSON.stringify(reserved), crypto.randomUUID(), session.storeId, session.id, attempt.id),
    conditionalEvent(db, next, { type: "BUYER", state: "complete", title: "Buyer approved exact cart and amount", detail: "Checkout claimed before contacting the order provider.", metadata: { cartVersion: session.cartVersion, amount: session.total, attemptId: attempt.id, idempotencyKey } }, "json_extract(policy_json, '$.checkoutAttempt.id') = ?", attempt.id),
    conditionalEvent(db, next, { type: "INVENTORY", state: "complete", title: "Stock reserved for checkout", detail: "Available stock reduced atomically with approval. Unconfirmed orders keep their reservation until reviewed.", metadata: { items: session.cart, attemptId: attempt.id } }, "json_extract(policy_json, '$.checkoutAttempt.id') = ?", attempt.id),
  ]);
  return Number((result[0] as { meta: { changes: number } }).meta.changes) === 1 ? next : null;
}

export async function markCheckoutUnknown(session: StoredSession, providerOrderId?: string) {
  const db = await database();
  const attempt = session.policy.checkoutAttempt!;
  const next = { ...session, updatedAt: new Date().toISOString(), policy: { ...session.policy, checkoutAttempt: { ...attempt, state: "unknown" as const, ...(providerOrderId ? { providerOrderId } : {}) } } };
  await db.batch([
    db.prepare("UPDATE shopping_sessions SET policy_json = ?, updated_at = ? WHERE id = ? AND status = 'approved' AND json_extract(policy_json, '$.checkoutAttempt.id') = ?")
      .bind(JSON.stringify(next.policy), next.updatedAt, session.id, attempt.id),
    conditionalEvent(db, next, { type: "MONEY", state: "failure", title: "Order outcome requires review", detail: "The provider response or local save could not be confirmed. Automatic retries and edits remain blocked.", metadata: { attemptId: attempt.id, idempotencyKey: attempt.idempotencyKey } }, "status = ?", "approved"),
  ]);
}

export async function getAuditBundle(sessionId: string | null | undefined, storeId: string) {
  const db = await database();
  const row = sessionId
    ? await db.prepare("SELECT * FROM shopping_sessions WHERE id = ? AND store_id = ?").bind(sessionId, storeId).first()
    : await db.prepare("SELECT * FROM shopping_sessions WHERE store_id = ? ORDER BY created_at DESC LIMIT 1").bind(storeId).first();
  if (!row) return null;
  const session = rowToSession(row);
  const result = await db.prepare("SELECT * FROM audit_events WHERE session_id = ? ORDER BY sequence ASC").bind(session.id).all<Record<string, unknown>>();
  const events: AuditEvent[] = result.results.map((event) => ({
    id: String(event.id), sequence: Number(event.sequence), type: String(event.type), state: String(event.state) as AuditEvent["state"],
    title: String(event.title), detail: String(event.detail), metadata: JSON.parse(String(event.metadata_json)), createdAt: String(event.created_at),
  }));
  return { session, events };
}

export async function getMerchantSnapshot(storeId: string) {
  const db = await database();
  const summary = await db.prepare(`SELECT COUNT(*) AS sessions,
    SUM(CASE WHEN status = 'ordered' THEN 1 ELSE 0 END) AS converted,
    SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) AS blocked,
    COALESCE(SUM(CASE WHEN status = 'ordered' THEN total ELSE 0 END), 0) AS revenue,
    COALESCE(AVG(CASE WHEN status = 'ordered' THEN total END), 0) AS aov
    FROM shopping_sessions WHERE store_id = ?`).bind(storeId).first<Record<string, unknown>>();
  const rows = await db.prepare("SELECT * FROM shopping_sessions WHERE store_id = ? ORDER BY created_at DESC LIMIT 8").bind(storeId).all<Record<string, unknown>>();
  const sessions = rows.results.map(rowToSession);
  return {
    sessions: Number(summary?.sessions ?? 0), converted: Number(summary?.converted ?? 0), blocked: Number(summary?.blocked ?? 0),
    revenue: Number(summary?.revenue ?? 0), aov: Math.round(Number(summary?.aov ?? 0)), recent: sessions,
  };
}
