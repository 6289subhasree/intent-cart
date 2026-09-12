import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createOrder, getSession, updateSession } from "@/db/repository";
import { evaluateCart } from "@/lib/commerce";

const schema = z.object({ sessionId: z.string().min(5), cartVersion: z.string().min(5), approval: z.literal(true) });

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Checkout blocked: exact approval and a current cart are required." }, { status: 400 });
  const session = await getSession(parsed.data.sessionId).catch(() => null);
  if (!session) return NextResponse.json({ error: "Checkout blocked: shopping session not found." }, { status: 404 });
  if (session.cartVersion !== parsed.data.cartVersion) return NextResponse.json({ error: "Checkout blocked: the approved cart version is stale." }, { status: 409 });
  if (session.status === "ordered" && session.orderId) return NextResponse.json({ id: session.orderId, amount: session.total, currency: session.currency, status: "created", reused: true });
  const policy = evaluateCart(session.cart, session.budget);
  if (!policy.passed || session.status === "blocked" || policy.total !== session.total) return NextResponse.json({ error: `Checkout blocked: ${policy.violations[0] ?? "cart policy changed."}` }, { status: 409 });

  const idempotencyKey = `intentcart-${session.cartVersion}-${policy.total}`;
  const apiUrl = process.env.PAYMENT_ORDER_API_URL;
  const keyId = process.env.PAYMENT_KEY_ID;
  const keySecret = process.env.PAYMENT_KEY_SECRET;
  let providerOrder: Record<string, unknown>;
  let mode: string;
  if (apiUrl && keyId && keySecret) {
    const idempotencyHeader = process.env.PAYMENT_IDEMPOTENCY_HEADER ?? "X-Idempotency-Key";
    const response = await fetch(apiUrl, { method: "POST", headers: { Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`, "Content-Type": "application/json", [idempotencyHeader]: idempotencyKey }, body: JSON.stringify({ amount: policy.total, currency: session.currency, receipt: session.cartVersion, notes: { source: "IntentCart", bounded: "true", buyer_approved: "true" } }) });
    if (!response.ok) return NextResponse.json({ error: "The test order could not be created. No charge was attempted.", retryable: true }, { status: 502 });
    providerOrder = await response.json() as Record<string, unknown>;
    mode = "payment_provider_test";
  } else {
    providerOrder = { id: `order_demo_${crypto.randomUUID().slice(0, 10)}`, amount: policy.total, currency: session.currency, status: "created" };
    mode = "safe_test_fallback";
  }
  const now = new Date().toISOString();
  const providerOrderId = String(providerOrder.id);
  await createOrder({ id: crypto.randomUUID(), sessionId: session.id, providerOrderId, amount: policy.total, currency: session.currency, status: String(providerOrder.status ?? "created"), mode, idempotencyKey, createdAt: now });
  const next = { ...session, status: "ordered" as const, policy, approvedAt: now, updatedAt: now, orderId: providerOrderId };
  await updateSession(next, [
    { type: "BUYER", state: "complete", title: "Buyer approved exact cart and amount", detail: `Approval captured for ${session.cartVersion} at ₹${(policy.total / 100).toLocaleString("en-IN")}.`, metadata: { approvedAmount: policy.total } },
    { type: "MONEY", state: "complete", title: "Test order created", detail: "The order was created after approval and retained its idempotency key.", metadata: { providerOrderId, mode, idempotencyKey } },
  ]);
  return NextResponse.json({ ...providerOrder, mode, idempotencyKey, sessionId: session.id, audit: { approved: true, bounded: true, idempotent: true } });
}
