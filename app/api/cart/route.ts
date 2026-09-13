import { eligibleProducts, evaluateIntentCart, parseShoppingIntent, sameProductCategory } from "@/lib/shopping-intent";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession, updateSession, type AuditEventInput } from "@/db/repository";
import { catalogueProduct, displayCart, normalizeLines } from "@/lib/commerce";

const schema = z.object({
  sessionId: z.string().min(5), cartVersion: z.string().min(5), action: z.enum(["update", "conflict", "repair"]),
  productId: z.string().optional(),
  items: z.array(z.object({ productId: z.string(), quantity: z.number().int().min(0).max(3) })).optional(),
});

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Cart update was rejected." }, { status: 400 });
  const session = await getSession(parsed.data.sessionId);
  if (!session) return NextResponse.json({ error: "Shopping session not found." }, { status: 404 });
  if (session.cartVersion !== parsed.data.cartVersion) return NextResponse.json({ error: "This cart changed. Reload the latest version.", code: "STALE_CART" }, { status: 409 });
  if (session.status === "ordered" || session.status === "approved") return NextResponse.json({ error: "Checkout has already started. This cart is locked.", code: "CHECKOUT_LOCKED" }, { status: 409 });
  let lines = normalizeLines(parsed.data.action === "update" ? parsed.data.items ?? session.cart : session.cart);
  const unavailable = [...(session.policy.unavailableProductIds ?? [])];
  const events: AuditEventInput[] = [];
  if (parsed.data.action === "conflict") {
    const id = parsed.data.productId ?? (lines.find((line) => line.productId === "sku_serum_04") ?? lines[0])?.productId;
    if (!id || !lines.some((line) => line.productId === id)) return NextResponse.json({ error: "Choose a product currently in the cart." }, { status: 400 });
    if (!unavailable.includes(id)) unavailable.push(id);
    events.push({ type: "INVENTORY", state: "failure", title: "Inventory conflict detected", detail: `${catalogueProduct(id)?.name ?? id} is unavailable for this session.`, metadata: { productId: id, moneyActionAttempted: false } });
  } else if (parsed.data.action === "repair") {
    if (!lines.some((line) => unavailable.includes(line.productId))) return NextResponse.json({ error: "There is no active inventory conflict to repair." }, { status: 409 });
    const candidates = eligibleProducts(parseShoppingIntent(session.intent, new Date(session.createdAt))).filter((product) => !unavailable.includes(product.id));
    for (const line of [...lines]) {
      if (!unavailable.includes(line.productId)) continue;
      const replacement = candidates.find((product) => {
        const proposed = normalizeLines(lines.map((item) => item.productId === line.productId ? { ...item, productId: product.id } : item));
        const policy = evaluateIntentCart(proposed, session.intent, session.budget, new Date(session.createdAt));
        return sameProductCategory(product.id, line.productId) && policy.passed;
      });
      if (!replacement) return NextResponse.json({ error: "No suitable replacement is available. Remove the unavailable item or build a different cart.", code: "NO_REPLACEMENT" }, { status: 409 });
      lines = normalizeLines(lines.map((item) => item.productId === line.productId ? { ...item, productId: replacement.id } : item));
    }
    events.push({ type: "RECOVERY", state: "repair", title: "Replacement selection checked", detail: "Available products from the same category were selected. Review the updated cart before approval." });
  } else {
    events.push({ type: "BUYER", state: "complete", title: "Cart quantities updated", detail: "Saved inventory conflicts and request constraints were checked again." });
  }
  const policy = evaluateIntentCart(lines, session.intent, session.budget, new Date(session.createdAt), unavailable);
  const next = { ...session, status: policy.passed ? "ready" as const : "blocked" as const, cart: lines, cartVersion: `${session.id}-${crypto.randomUUID()}`, policy, total: policy.total, updatedAt: new Date().toISOString(), approvedAt: null };
  if (!await updateSession(next, events, session.cartVersion)) return NextResponse.json({ error: "Another cart action or checkout won this request. Reload the latest cart.", code: "STALE_CART" }, { status: 409 });
  return NextResponse.json({ ...next, items: displayCart(lines) });
}
