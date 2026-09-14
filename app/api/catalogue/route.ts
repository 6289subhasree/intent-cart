import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/db/repository";
import { withMerchant, readJson, AccessError } from "@/lib/auth";
import { productsSchema } from "@/lib/catalogue-schema";
import { productCategory } from "@/lib/shopping-intent";
const schema = z.object({ version: z.string().min(1), products: z.array(z.unknown()).max(200) }).strict();
export const GET = withMerchant(async (_request, merchant) => NextResponse.json({ products: merchant.catalogue.map(p => ({ ...p, category: productCategory(p) })), version: merchant.catalogueVersion, storeName: merchant.storeName }));
export const PUT = withMerchant(async (request, merchant) => {
  const body = schema.safeParse(await readJson(request, 512000));
  if (!body.success) throw new AccessError("Provide a catalogue version and up to 200 products.", 400);
  const parsed = productsSchema.safeParse(body.data.products.map(p => typeof p === "object" && p !== null ? { ...p, category: (p as { category?: string }).category ?? productCategory(p as { id: string }) } : p));
  if (!parsed.success) throw new AccessError(parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; "), 400);
  const db = await database();
  const pending = await db.prepare("SELECT cart_json FROM shopping_sessions WHERE store_id = ? AND status = 'approved'").bind(merchant.storeId).all();
  const reservedIds = new Set(pending.results.flatMap(row => (JSON.parse(String(row.cart_json)) as { productId: string }[]).map(line => line.productId)));
  for (const id of reservedIds) {
    const prior = merchant.catalogue.find(p => p.id === id); const next = parsed.data.find(p => p.id === id);
    if (!next || (prior && productCategory(prior) !== next.category)) throw new AccessError("Products with pending reservations cannot be deleted or recategorized. Resolve their checkouts first.", 409);
  }
  const version = crypto.randomUUID();
  const row = await db.prepare("UPDATE stores SET catalogue_json = ?, catalogue_version = ? WHERE id = ? AND owner_id = ? AND catalogue_version = ? RETURNING id")
    .bind(JSON.stringify(parsed.data), version, merchant.storeId, merchant.merchantId, body.data.version).first();
  if (!row) throw new AccessError("The catalogue changed elsewhere. Reload it before saving.", 409);
  return NextResponse.json({ products: parsed.data, version, storeName: merchant.storeName });
});
