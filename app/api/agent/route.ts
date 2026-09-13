import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createSession, type AuditEventInput, type StoredSession } from "@/db/repository";
import { CATALOGUE_VERSION, catalogue, displayCart, type CartLine } from "@/lib/commerce";

import { parseShoppingIntent, eligibleProducts, evaluateIntentCart, fallbackRecommendation, coversRequestedCategories } from "@/lib/shopping-intent";

const requestSchema = z.object({ intent: z.string().trim().min(8).max(500) });
const recommendationSchema = z.object({
  cart: z.array(z.string()).min(1).max(4), title: z.string().min(3).max(100), fitScore: z.number().min(0).max(1),
  reasons: z.record(z.string(), z.string()).optional(), rejected: z.array(z.object({ id: z.string(), reason: z.string() })).optional(),
});


function outputText(payload: unknown) {
  const response = payload as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  return response.output_text ?? response.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("") ?? "";
}

async function recommend(intent: string, constraints: ReturnType<typeof parseShoppingIntent>, createdAt: Date) {
  const fallback = fallbackRecommendation(constraints);
  const products = eligibleProducts(constraints);
  const apiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!apiKey && !geminiKey) return { recommendation: fallback, mode: "deterministic_fallback" as const };
  try {
    const response = geminiKey ? await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(process.env.GEMINI_MODEL || "gemini-3.5-flash-lite")}:generateContent`, {
      method: "POST",
      signal: AbortSignal.timeout(30000),
      headers: { "x-goog-api-key": geminiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: "Select only supplied catalogue IDs that match the buyer request. Respect the supplied constraints and budget (prices are paise). Return JSON with cart (array of product IDs), title (string), fitScore (number from 0 to 1), reasons (object mapping IDs to explanation strings), and rejected (array of objects with id and reason). Never authorize payment." }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify({ intent, constraints, catalogue: products }) }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }) : await fetch("https://api.openai.com/v1/responses", {
      method: "POST", signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL ?? "gpt-5-mini", input: [
        { role: "system", content: "Select only supplied catalogue IDs. Respect the supplied constraints and budget (amounts are paise). Return JSON with cart, title, fitScore, reasons and rejected. Never authorize payment." },
        { role: "user", content: JSON.stringify({ intent, constraints, catalogue: products }) },
      ] }),
    });
    if (!response.ok) throw new Error("provider unavailable");
    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ thought?: boolean; text?: string }> } }> };
    const text = geminiKey
      ? (payload.candidates?.[0]?.content?.parts ?? []).filter((part: { thought?: boolean }) => !part.thought).map((part: { text?: string }) => part.text ?? "").join("")
      : outputText(payload);
    const parsed = recommendationSchema.parse(JSON.parse(text.replace(/^```json|```$/g, "").trim()));
    const knownIds = new Set(catalogue.map((product) => product.id));
    if (parsed.cart.some((id) => !knownIds.has(id))) throw new Error("unknown product");
    if (!coversRequestedCategories(parsed.cart, constraints)) throw new Error("requested category missing");
    if (!evaluateIntentCart(parsed.cart.map((productId) => ({ productId, quantity: 1 })), intent, constraints.budget, createdAt).passed) throw new Error("policy violation");
    return { recommendation: parsed, mode: "ai" as const };
  } catch {
    return { recommendation: fallback, mode: "deterministic_fallback" as const, degradedGracefully: true };
  }
}

export async function POST(request: NextRequest) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A valid shopping intent is required." }, { status: 400 });
  const at = new Date();
  const constraints = parseShoppingIntent(parsed.data.intent, at);
  if (constraints.error) return NextResponse.json({ error: constraints.error, code: "CLARIFICATION_REQUIRED" }, { status: 422 });
  const result = await recommend(parsed.data.intent, constraints, at);
  if (!result.recommendation.cart.length) return NextResponse.json({
    error: "No matching products fit this budget and these requirements. Try changing your budget, product selection or delivery request.",
    code: "NO_MATCH", constraints,
  }, { status: 422 });
  const lines: CartLine[] = result.recommendation.cart.map((productId) => ({ productId, quantity: 1 }));
  const policy = evaluateIntentCart(lines, parsed.data.intent, constraints.budget, at);
  const createdAt = at.toISOString();
  const id = `IC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const session: StoredSession = {
    id, intent: parsed.data.intent, title: result.recommendation.title, mode: result.mode, status: "ready", budget: constraints.budget,
    total: policy.total, currency: "INR", cartVersion: `${id}-v1`, fitScore: result.recommendation.fitScore, cart: lines, policy,
    createdAt, updatedAt: createdAt, approvedAt: null, orderId: null,
  };
  const events: AuditEventInput[] = [
    { type: "AGENT", state: "complete", title: "Buyer intent parsed", detail: parsed.data.intent, metadata: { mode: result.mode, constraints } },
    { type: "CATALOGUE", state: "complete", title: `${catalogue.length} catalogue products evaluated`, detail: "Availability, delivery, price and product fit were checked.", metadata: { catalogueVersion: CATALOGUE_VERSION } },
    { type: "AGENT", state: "complete", title: "Cart recommendation created", detail: `${lines.length} products selected and checked against the supported request constraints.`, metadata: { cartVersion: session.cartVersion, total: policy.total } },
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
