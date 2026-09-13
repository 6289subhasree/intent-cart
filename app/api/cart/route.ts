import { evaluateIntentCart } from "@/lib/shopping-intent";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getSession, updateSession, type AuditEventInput } from "@/db/repository";
import { displayCart, repairUnavailableSerum } from "@/lib/commerce";

const schema = z.object({
  sessionId: z.string().min(5), cartVersion: z.string().min(5), action: z.enum(["update", "conflict", "repair"]),
  items: z.array(z.object({ productId: z.string(), quantity: z.number().int().min(0).max(3) })).optional(),
});

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Cart update was rejected." }, { status: 400 });
  const session = await getSession(parsed.data.sessionId).catch(() => null);
  if (!session) return NextResponse.json({ error: "Shopping session not found." }, { status: 404 });
  if (session.cartVersion !== parsed.data.cartVersion) return NextResponse.json({ error: "This cart changed in another action. Reload the latest version.", code: "STALE_CART" }, { status: 409 });
  if (session.status === "ordered") return NextResponse.json({ error: "This order is already complete." }, { status: 409 });
  let lines = parsed.data.items ?? session.cart;
  const events: AuditEventInput[] = [];
  const now = new Date().toISOString();
  if (parsed.data.action === "conflict") {
    const policy = evaluateIntentCart(lines, session.intent, session.budget, new Date(session.createdAt), ["sku_serum_04"]);
    const next = { ...session, status: "blocked" as const, policy, total: policy.total, updatedAt: now, approvedAt: null };
    events.push({ type: "INVENTORY", state: "failure", title: "Inventory conflict detected", detail: "Bright C Serum became unavailable. Checkout was blocked before order creation.", metadata: { code: "INV-409", moneyActionAttempted: false } });
    await updateSession(next, events);
    return NextResponse.json({ ...next, items: displayCart(lines) });
  }
  if (parsed.data.action === "repair") {
    lines = repairUnavailableSerum(session.cart);
    events.push(
      { type: "RECOVERY", state: "repair", title: "Cart repaired and revalidated", detail: "The unavailable serum was replaced with Calm Barrier Serum at the same price.", metadata: { approvalReset: true } },
      { type: "GATE", state: "waiting", title: "Explicit approval requested again", detail: "The changed cart needs fresh approval for its exact amount." },
    );
  } else {
    events.push({ type: "BUYER", state: "complete", title: "Cart quantities updated", detail: "The buyer edited the cart and policy checks ran again." });
  }
  const policy = evaluateIntentCart(lines, session.intent, session.budget, new Date(session.createdAt));
  const cartVersion = `${session.id}-v${Date.now().toString(36)}`;
  const next = { ...session, status: policy.passed ? "ready" as const : "blocked" as const, cart: lines, cartVersion, policy, total: policy.total, updatedAt: now, approvedAt: null };
  await updateSession(next, events);
  return NextResponse.json({ ...next, items: displayCart(lines) });
}
