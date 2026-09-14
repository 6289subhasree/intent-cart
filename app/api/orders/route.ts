import { NextResponse } from "next/server";
import { database, getAuditBundle } from "@/db/repository";
import { AccessError, withMerchant } from "@/lib/auth";

export const GET = withMerchant(async (request, merchant) => {
  const url = new URL(request.url); const id = url.searchParams.get("sessionId");
  if (id) {
    const trace = await getAuditBundle(id, merchant.storeId);
    if (!trace || !["approved", "ordered", "cancelled"].includes(trace.session.status)) throw new AccessError("Order not found.", 404);
    return NextResponse.json(trace);
  }
  const offset = Number(url.searchParams.get("offset") ?? 0);
  if (!Number.isInteger(offset) || offset < 0 || offset > 1000000) throw new AccessError("Invalid page.", 400);
  const rows = await (await database()).prepare("SELECT id, title, total, currency, status, created_at, updated_at, order_id, policy_json FROM shopping_sessions WHERE store_id = ? AND status IN ('approved', 'ordered', 'cancelled') ORDER BY created_at DESC, id DESC LIMIT 51 OFFSET ?").bind(merchant.storeId, offset).all();
  return NextResponse.json({ orders: rows.results.slice(0, 50).map(row => ({ id: row.id, title: row.title, total: row.total, status: row.status, createdAt: row.created_at, orderId: row.order_id, attempt: JSON.parse(String(row.policy_json)).checkoutAttempt })), hasMore: rows.results.length > 50 });
});
