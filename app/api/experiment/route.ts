import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { database } from "@/db/repository";
import { withMerchant, readJson, AccessError } from "@/lib/auth";
import { EXPERIMENT_ID, experimentEnabled, experimentExcluded } from "@/lib/experiment";
import { productCategory } from "@/lib/shopping-intent";

export const GET = withMerchant(async (_request, merchant) => {
  if (!experimentEnabled() || experimentExcluded(merchant.username)) return NextResponse.json({ enabled: false });
  const db = await database();
  // Only first-time cart builders are enrolled. A unique key fixes assignment across tabs/devices.
  await db.prepare("INSERT OR IGNORE INTO experiment_assignments (merchant_id, variant, assigned_at) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM shopping_sessions WHERE store_id = ?)").bind(merchant.merchantId, randomInt(2) ? "B" : "A", Date.now(), merchant.storeId).run();
  const row = await db.prepare("SELECT variant FROM experiment_assignments WHERE merchant_id = ?").bind(merchant.merchantId).first();
  if (!row) return NextResponse.json({ enabled: false });
  const categories = new Set<string>(); const examples: string[] = [];
  for (const product of merchant.catalogue.filter(p => p.stock > 0)) {
    const category = productCategory(product);
    if (!category || categories.has(category)) continue;
    categories.add(category); examples.push(`Only ${category} under ₹${Math.ceil(product.price / 100)} delivered within ${product.deliveryDays} days`);
    if (examples.length === 3) break;
  }
  return NextResponse.json({ enabled: true, experimentId: EXPERIMENT_ID, variant: row.variant, examples: row.variant === "B" ? examples : [] });
});
export const POST = withMerchant(async (request, merchant) => {
  const body = await readJson(request);
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length) throw new AccessError("Exposure takes an empty JSON object.", 400);
  if (!experimentEnabled() || experimentExcluded(merchant.username)) return NextResponse.json({ recorded: false });
  const row = await (await database()).prepare("UPDATE experiment_assignments SET exposed_at = COALESCE(exposed_at, ?) WHERE merchant_id = ? RETURNING exposed_at").bind(Date.now(), merchant.merchantId).first();
  return NextResponse.json({ recorded: Boolean(row) });
});
