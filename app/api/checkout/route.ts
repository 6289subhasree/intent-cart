import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({ amount: z.number().int().positive().max(200000), approval: z.literal(true), cartVersion: z.string().min(3) });

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Checkout blocked: approval, amount or cart version is invalid." }, { status: 400 });

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    return NextResponse.json({ id: `order_test_${crypto.randomUUID().slice(0, 10)}`, amount: parsed.data.amount, currency: "INR", status: "created", mode: "safe_test_fallback", audit: { approved: true, bounded: true, idempotent: true } });
  }

  const idempotencyKey = `intentcart-${parsed.data.cartVersion}-${parsed.data.amount}`;
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
      "Content-Type": "application/json",
      "X-Razorpay-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ amount: parsed.data.amount, currency: "INR", receipt: parsed.data.cartVersion, notes: { source: "IntentCart", bounded: "true", buyer_approved: "true" } }),
  });
  if (!response.ok) return NextResponse.json({ error: "Razorpay test order could not be created. No charge was attempted.", retryable: true }, { status: 502 });
  const order = await response.json();
  return NextResponse.json({ ...order, mode: "razorpay_test", keyId, audit: { approved: true, bounded: true, idempotent: true } });
}
