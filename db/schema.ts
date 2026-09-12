import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const shoppingSessions = sqliteTable("shopping_sessions", {
  id: text("id").primaryKey(),
  intent: text("intent").notNull(),
  title: text("title").notNull(),
  mode: text("mode").notNull(),
  status: text("status").notNull(),
  budget: integer("budget").notNull(),
  total: integer("total").notNull(),
  currency: text("currency").notNull(),
  cartVersion: text("cart_version").notNull(),
  fitScore: integer("fit_score").notNull(),
  cartJson: text("cart_json").notNull(),
  policyJson: text("policy_json").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  approvedAt: text("approved_at"),
  orderId: text("order_id"),
}, (table) => [index("idx_sessions_created_at").on(table.createdAt), index("idx_sessions_status_created_at").on(table.status, table.createdAt)]);

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => shoppingSessions.id),
  sequence: integer("sequence").notNull(),
  type: text("type").notNull(),
  state: text("state").notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull(),
  metadataJson: text("metadata_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("idx_events_session_sequence").on(table.sessionId, table.sequence)]);

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => shoppingSessions.id),
  providerOrderId: text("provider_order_id").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull(),
  status: text("status").notNull(),
  mode: text("mode").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("idx_orders_session_id").on(table.sessionId), uniqueIndex("idx_orders_idempotency_key").on(table.idempotencyKey)]);
