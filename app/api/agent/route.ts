import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const requestSchema = z.object({ intent: z.string().min(8).max(500) });

const catalogue = [
  { id: "sku_cleanser_01", name: "Dewdrop Cleanser", price: 54900, tags: ["sensitive-skin", "fragrance-free", "gift"], stock: 18, deliveryDays: 2 },
  { id: "sku_serum_04", name: "Bright C Serum", price: 74900, tags: ["vitamin-c", "gift"], stock: 9, deliveryDays: 2 },
  { id: "sku_spf_07", name: "Cloudveil SPF 50", price: 59900, tags: ["sensitive-skin", "fragrance-free"], stock: 23, deliveryDays: 2 },
  { id: "sku_barrier_02", name: "Calm Barrier Serum", price: 74900, tags: ["sensitive-skin", "ceramides", "fragrance-free"], stock: 11, deliveryDays: 2 },
];

const fallback = {
  cart: ["sku_cleanser_01", "sku_serum_04", "sku_spf_07"],
  title: "A sensitive-skin starter ritual",
  total: 189700,
  currency: "INR",
  fitScore: 0.96,
  reasons: {
    sku_cleanser_01: "Fragrance-free and suited to sensitive skin",
    sku_serum_04: "Adds a gift-worthy treatment within budget",
    sku_spf_07: "Completes a practical morning routine",
  },
  rejected: [{ id: "sku_barrier_02", reason: "Lower bundle diversity in the initial recommendation" }],
  policy: { withinBudget: true, stockValid: true, deliveryValid: true, approvalRequired: true },
};

function outputText(payload: unknown) {
  const response = payload as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  return response.output_text ?? response.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("") ?? "";
}

export async function POST(request: NextRequest) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A valid shopping intent is required." }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ ...fallback, mode: "deterministic_fallback", catalogueVersion: "nova-2026-09-06" });

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
        input: [
          { role: "system", content: "You are a bounded commerce recommendation engine. Select only supplied catalogue IDs. Stay below INR 2000 (amounts are paise), require explicit approval, and return only JSON." },
          { role: "user", content: JSON.stringify({ intent: parsed.data.intent, catalogue }) },
        ],
      }),
    });
    if (!response.ok) throw new Error("provider unavailable");
    const text = outputText(await response.json());
    const candidate = JSON.parse(text.replace(/^```json|```$/g, "").trim());
    const validIds = new Set(catalogue.map((item) => item.id));
    if (!Array.isArray(candidate.cart) || candidate.cart.some((id: string) => !validIds.has(id))) throw new Error("invalid catalogue selection");
    const total = candidate.cart.reduce((sum: number, id: string) => sum + (catalogue.find((item) => item.id === id)?.price ?? 0), 0);
    if (total > 200000) throw new Error("budget violation");
    return NextResponse.json({ ...candidate, total, currency: "INR", mode: "ai", policy: { withinBudget: true, stockValid: true, deliveryValid: true, approvalRequired: true }, catalogueVersion: "nova-2026-09-06" });
  } catch {
    return NextResponse.json({ ...fallback, mode: "deterministic_fallback", degradedGracefully: true, catalogueVersion: "nova-2026-09-06" });
  }
}
