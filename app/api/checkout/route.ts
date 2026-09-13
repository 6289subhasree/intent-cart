import { evaluateIntentCart } from "@/lib/shopping-intent";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { claimCheckout, completeOrder, getSession, markCheckoutUnknown } from "@/db/repository";

const schema = z.object({ sessionId: z.string().min(5), cartVersion: z.string().min(5), approval: z.literal(true) });
const orderSchema = z.object({ id: z.string().min(1), amount: z.number().int().positive(), currency: z.literal("INR"), status: z.string().min(1) });

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Checkout blocked: exact approval and a current cart are required." }, { status: 400 });
  const session = await getSession(parsed.data.sessionId);
  if (!session) return NextResponse.json({ error: "Checkout blocked: shopping session not found." }, { status: 404 });
  if (session.cartVersion !== parsed.data.cartVersion) return NextResponse.json({ error: "Checkout blocked: the approved cart version is stale." }, { status: 409 });
  if (session.status === "ordered" && session.orderId) return NextResponse.json({ id: session.orderId, amount: session.total, currency: session.currency, status: "created", reused: true });
  if (session.status === "approved") return NextResponse.json({ error: "Checkout is already in progress or awaiting review. Do not submit a replacement order.", code: "CHECKOUT_LOCKED" }, { status: 409 });
  const policy = evaluateIntentCart(session.cart, session.intent, session.budget, new Date(session.createdAt), session.policy.unavailableProductIds ?? []);
  if (!policy.passed || session.status !== "ready" || policy.total !== session.total) return NextResponse.json({ error: `Checkout blocked: ${policy.violations[0] ?? "cart policy changed."}` }, { status: 409 });

  const idempotencyKey = `intentcart-${session.cartVersion}-${policy.total}`;
  const apiUrl = process.env.PAYMENT_ORDER_API_URL;
  const keyId = process.env.PAYMENT_KEY_ID;
  const keySecret = process.env.PAYMENT_KEY_SECRET;
  if ([apiUrl, keyId, keySecret].some(Boolean) && ![apiUrl, keyId, keySecret].every(Boolean)) return NextResponse.json({ error: "Order provider configuration is incomplete." }, { status: 503 });
  const claimed = await claimCheckout({ ...session, policy }, idempotencyKey);
  if (!claimed) return NextResponse.json({ error: "Another checkout or cart edit won this request. Reload the saved session.", code: "CHECKOUT_LOCKED" }, { status: 409 });
  let observedProviderOrderId: string | undefined;
  try {
    let providerOrder: z.infer<typeof orderSchema>;
    let mode: string;
    if (apiUrl && keyId && keySecret) {
      const response = await fetch(apiUrl, {
        method: "POST", signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`, "Content-Type": "application/json", [process.env.PAYMENT_IDEMPOTENCY_HEADER ?? "X-Idempotency-Key"]: idempotencyKey },
        body: JSON.stringify({ amount: policy.total, currency: session.currency, receipt: session.cartVersion, notes: { source: "IntentCart", bounded: "true", buyer_approved: "true" } }),
      });
      if (!response.ok) throw new Error("Provider outcome unconfirmed");
      providerOrder = orderSchema.parse(await response.json());
      observedProviderOrderId = providerOrder.id;
      if (providerOrder.amount !== policy.total) throw new Error("Provider amount mismatch");
      mode = "payment_provider_test";
    } else {
      providerOrder = { id: `order_demo_${crypto.randomUUID()}`, amount: policy.total, currency: "INR", status: "created" };
      mode = "safe_test_fallback";
    }
    const now = new Date().toISOString();
    const next = { ...claimed, status: "ordered" as const, updatedAt: now, orderId: providerOrder.id, policy: { ...claimed.policy, checkoutAttempt: { ...claimed.policy.checkoutAttempt, state: "completed" as const, providerOrderId: providerOrder.id } } };
    await completeOrder(next, { id: crypto.randomUUID(), sessionId: session.id, providerOrderId: providerOrder.id, amount: policy.total, currency: session.currency, status: providerOrder.status, mode, idempotencyKey, createdAt: now }, [
      { type: "MONEY", state: "complete", title: "Test order created", detail: "Order response validated and saved under the exclusive checkout claim.", metadata: { providerOrderId: providerOrder.id, mode, idempotencyKey } },
    ]);
    return NextResponse.json({ ...providerOrder, mode, idempotencyKey, sessionId: session.id });
  } catch {
    const completed = await getSession(session.id).catch(() => null);
    if (completed?.status === "ordered" && completed.orderId) return NextResponse.json({ id: completed.orderId, amount: completed.total, currency: completed.currency, status: "created", reused: true });
    await markCheckoutUnknown(claimed, observedProviderOrderId).catch(() => undefined);
    return NextResponse.json({ error: "The order outcome could not be confirmed. This cart is locked for review to prevent a duplicate order. Check its audit trail before taking further action.", code: "ORDER_REVIEW_REQUIRED", retryable: false }, { status: 502 });
  }
}
