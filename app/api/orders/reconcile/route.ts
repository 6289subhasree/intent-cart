import { NextResponse } from "next/server";
import { z } from "zod";
import { withMerchant, readJson, rateLimit, AccessError } from "@/lib/auth";
import { getSession, completeOrder } from "@/db/repository";
import { releaseReservation } from "@/lib/order-recovery";

const schema = z.object({ sessionId: z.string().min(5) }).strict();
const evidenceSchema = z.object({ idempotencyKey: z.string(), amount: z.number().int().positive(), currency: z.literal("INR"), terminal: z.literal(true), outcome: z.enum(["created", "cancelled", "not_created"]), orderId: z.string().min(1).optional() });
export const POST = withMerchant(async (request, merchant) => {
  await rateLimit(`reconcile:${merchant.merchantId}`, 20);
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) throw new AccessError("Choose a checkout to review.", 400);
  const session = await getSession(parsed.data.sessionId, merchant.storeId);
  if (!session) throw new AccessError("Order not found.", 404);
  if (session.status === "ordered" || session.status === "cancelled") return NextResponse.json({ status: session.status, reused: true });
  const attempt = session.policy.checkoutAttempt;
  if (session.status !== "approved" || !attempt) throw new AccessError("Checkout is not awaiting review.", 409);
  if (Date.now() - Date.parse(session.approvedAt ?? session.updatedAt) < 60000) throw new AccessError("Checkout may still be running. Wait one minute before checking again.", 409);
  // Local test orders have no external side effect. A committed order would already be 'ordered'.
  if (attempt.providerMode === "local_test") {
    await releaseReservation(session, "Local test mode: no committed order exists");
    return NextResponse.json({ status: "cancelled" });
  }
  const endpoint = process.env.PAYMENT_RECONCILE_API_URL;
  if (!endpoint || !process.env.PAYMENT_KEY_ID || !process.env.PAYMENT_KEY_SECRET) throw new AccessError("Provider reconciliation is not configured. Stock remains reserved.", 503);
  if (new URL(endpoint).protocol !== "https:") throw new AccessError("Reconciliation requires an HTTPS endpoint.", 503);
  let evidence: z.infer<typeof evidenceSchema>;
  try {
    const response = await fetch(endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(15000), headers: { "Content-Type": "application/json", Authorization: `Basic ${btoa(`${process.env.PAYMENT_KEY_ID}:${process.env.PAYMENT_KEY_SECRET}`)}` }, body: JSON.stringify({ idempotencyKey: attempt.idempotencyKey, orderId: attempt.providerOrderId, amount: session.total, currency: session.currency }) });
    if (!response.ok) throw new Error("Unconfirmed");
    evidence = evidenceSchema.parse(await response.json());
    if (evidence.idempotencyKey !== attempt.idempotencyKey || evidence.amount !== session.total || (attempt.providerOrderId && evidence.orderId !== attempt.providerOrderId)) throw new Error("Mismatched checkout");
    if (evidence.outcome === "created" && !evidence.orderId) throw new Error("Missing order ID");
  } catch { throw new AccessError("Provider outcome is still unconfirmed. Stock remains reserved.", 502); }
  if (evidence.outcome !== "created") {
    await releaseReservation(session, `Provider confirmed ${evidence.outcome}: ${attempt.idempotencyKey}`);
    return NextResponse.json({ status: "cancelled" });
  }
  const now = new Date().toISOString();
  await completeOrder({ ...session, updatedAt: now }, { id: crypto.randomUUID(), sessionId: session.id, providerOrderId: evidence.orderId!, amount: session.total, currency: session.currency, status: "created", mode: "payment_provider_test", idempotencyKey: attempt.idempotencyKey, createdAt: now }, [{ type: "MONEY", state: "complete", title: "Provider order recovered", detail: "Confirmed the existing provider order without creating another order." }]);
  return NextResponse.json({ status: "ordered" });
});
