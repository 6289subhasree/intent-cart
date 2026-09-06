import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({ amount: z.number().int().positive().max(200000), approval: z.literal(true), cartVersion: z.string().min(3) });

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Checkout blocked: approval, amount or cart version is invalid." }, { status: 400 });

  const idempotencyKey = `intentcart-${parsed.data.cartVersion}-${parsed.data.amount}`;
  return NextResponse.json({
    id: `order_demo_${crypto.randomUUID().slice(0, 10)}`,
    amount: parsed.data.amount,
    currency: "INR",
    status: "created",
    mode: "safe_test_checkout",
    idempotencyKey,
    audit: { approved: true, bounded: true, idempotent: true },
  });
}
