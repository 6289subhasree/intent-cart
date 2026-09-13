import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/db/repository";
import { withMerchant, readJson, AccessError } from "@/lib/auth";
import { catalogue } from "@/lib/commerce";
const product = z.object({
  id: z.string().refine((id) => catalogue.some((item) => item.id === id)),
  name: z.string().trim().min(2).max(100), detail: z.string().trim().min(1).max(180),
  price: z.number().int().min(1).max(100000000), stock: z.number().int().min(0).max(100000), deliveryDays: z.number().int().min(0).max(30),
  tags: z.array(z.enum(["sensitive-skin", "fragrance-free", "gift", "vitamin-c", "ceramides", "reusable"])).max(6),
  crop: z.enum(["product-one", "product-two", "product-three"]),
}).strict();
const schema = z.object({ version: z.string().min(1), products: z.array(product).length(5) }).strict();
export const GET = withMerchant(async (_request, merchant) => NextResponse.json({ products: merchant.catalogue, version: merchant.catalogueVersion, storeName: merchant.storeName }));
export const PUT = withMerchant(async (request, merchant) => {
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success || new Set(parsed.data.products.map((item) => item.id)).size !== 5) throw new AccessError("Provide all five distinct catalogue products with valid prices and stock.", 400);
  const version = crypto.randomUUID();
  const row = await (await database()).prepare("UPDATE stores SET catalogue_json = ?, catalogue_version = ? WHERE id = ? AND owner_id = ? AND catalogue_version = ? RETURNING id")
    .bind(JSON.stringify(parsed.data.products), version, merchant.storeId, merchant.merchantId, parsed.data.version).first();
  if (!row) throw new AccessError("The catalogue changed elsewhere. Reload it before saving.", 409);
  return NextResponse.json({ products: parsed.data.products, version, storeName: merchant.storeName });
});
