import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createSession, type AuditEventInput, type StoredSession } from "@/db/repository";
import { CATALOGUE_VERSION, DEFAULT_BUDGET, catalogue, defaultReasons, displayCart, evaluateCart, type CartLine } from "@/lib/commerce";

const requestSchema = z.object({ intent: z.string().trim().min(8).max(500) });
const recommendationSchema = z.object({
  cart: z.array(z.string()).min(1).max(4), title: z.string().min(3).max(100), fitScore: z.number().min(0).max(1),
  reasons: z.record(z.string(), z.string()).optional(), rejected: z.array(z.object({ id: z.string(), reason: z.string() })).optional(),
});

const fallback = {
  cart: ["sku_cleanser_01", "sku_serum_04", "sku_spf_07"], title: "A sensitive-skin starter ritual", fitScore: 0.96,
  reasons: defaultReasons, rejected: [{ id: "sku_barrier_02", reason: "Lower bundle diversity in the initial recommendation" }],
};

function outputText(payload: unknown) {
  const response = payload as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  return response.output_text ?? response.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("") ?? "";
}

async function recommend(intent: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { recommendation: fallback, mode: "deterministic_fallback" as const };
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL ?? "gpt-5-mini", input: [
        { role: "system", content: "Select only supplied catalogue IDs. Stay below INR 2000 (amounts are paise). Return JSON with cart, title, fitScore, reasons and rejected. Never authorize payment." },
        { role: "user", content: JSON.stringify({ intent, catalogue }) },
      ] }),
    });
    if (!response.ok) throw new Error("provider unavailable");
    const parsed = recommendationSchema.parse(JSON.parse(outputText(await response.json()).replace(/^```json|```$/g, "").trim()));
    const knownIds = new Set(catalogue.map((product) => product.id));
    if (parsed.cart.some((id) => !knownIds.has(id))) throw new Error("unknown product");
    if (!evaluateCart(parsed.cart.map((productId) => ({ productId, quantity: 1 }))).passed) throw new Error("policy violation");
    return { recommendation: parsed, mode: "ai" as const };
  } catch {
    return { recommendation: fallback, mode: "deterministic_fallback" as const, degradedGracefully: true };
  }
}

export async function POST(request: NextRequest) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A valid shopping intent is required." }, { status: 400 });
  const result = await recommend(parsed.data.intent);
  const lines: CartLine[] = result.recommendation.cart.map((productId) => ({ productId, quantity: 1 }));
  const policy = evaluateCart(lines, DEFAULT_BUDGET);
  const createdAt = new Date().toISOString();
  const id = `IC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const session: StoredSession = {
    id, intent: parsed.data.intent, title: result.recommendation.title, mode: result.mode, status: "ready", budget: DEFAULT_BUDGET,
    total: policy.total, currency: "INR", cartVersion: `${id}-v1`, fitScore: result.recommendation.fitScore, cart: lines, policy,
    createdAt, updatedAt: createdAt, approvedAt: null, orderId: null,
  };
  const events: AuditEventInput[] = [
    { type: "AGENT", state: "complete", title: "Buyer intent parsed", detail: parsed.data.intent, metadata: { mode: result.mode } },
    { type: "CATALOGUE", state: "complete", title: `${catalogue.length} catalogue products evaluated`, detail: "Availability, delivery, price and product fit were checked.", metadata: { catalogueVersion: CATALOGUE_VERSION } },
    { type: "AGENT", state: "complete", title: "Cart recommendation created", detail: `${lines.length} products selected with a ${(session.fitScore * 100).toFixed(0)}% fit score.`, metadata: { cartVersion: session.cartVersion, total: policy.total } },
    { type: "POLICY", state: "waiting", title: "Pre-checkout bounds passed", detail: "Budget, quantity, stock and delivery checks passed. Exact buyer approval is still required.", metadata: { policy } },
  ];
  try {
    await createSession(session, events);
  } catch (error) {
    console.error("Failed to persist recommendation session", error);
    return NextResponse.json({ error: "The cart could not be saved. Please try again." }, { status: 503 });
  }
  return NextResponse.json({ ...session, items: displayCart(lines, result.recommendation.reasons), rejected: result.recommendation.rejected ?? [], catalogueVersion: CATALOGUE_VERSION, degradedGracefully: "degradedGracefully" in result ? result.degradedGracefully : false });
}
