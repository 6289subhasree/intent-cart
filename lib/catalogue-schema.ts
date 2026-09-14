import { z } from "zod";
export const productSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  name: z.string().trim().min(2).max(100), detail: z.string().trim().min(1).max(180),
  category: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9 -]{1,39}$/),
  price: z.number().int().min(1).max(100000000), stock: z.number().int().min(0).max(100000), deliveryDays: z.number().int().min(0).max(30),
  tags: z.array(z.string().trim().min(1).max(40)).max(12),
  crop: z.enum(["product-one", "product-two", "product-three"]).default("product-one"),
  imageUrl: z.string().max(2048).refine(value => !value || (() => { try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; } })(), "Image must use HTTPS").optional(),
}).strict();
export const productsSchema = z.array(productSchema).max(200).refine(products => new Set(products.map(p => p.id)).size === products.length, "Product IDs must be unique");
