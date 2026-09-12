export const CATALOGUE_VERSION = "nova-2026-09-12";
export const DEFAULT_BUDGET = 200_000;

export type CatalogueProduct = {
  id: string;
  name: string;
  detail: string;
  price: number;
  tags: string[];
  stock: number;
  deliveryDays: number;
  crop: string;
};

export type CartLine = { productId: string; quantity: number };

export type PolicyResult = {
  withinBudget: boolean;
  stockValid: boolean;
  deliveryValid: boolean;
  quantitiesValid: boolean;
  approvalRequired: true;
  passed: boolean;
  violations: string[];
};

export type DisplayCartItem = CatalogueProduct & {
  quantity: number;
  reason: string;
};

export const catalogue: CatalogueProduct[] = [
  { id: "sku_cleanser_01", name: "Dewdrop Cleanser", detail: "120 ml · Gentle daily wash", price: 54_900, tags: ["sensitive-skin", "fragrance-free", "gift"], stock: 18, deliveryDays: 2, crop: "product-one" },
  { id: "sku_serum_04", name: "Bright C Serum", detail: "30 ml · 10% vitamin C", price: 74_900, tags: ["vitamin-c", "gift"], stock: 9, deliveryDays: 2, crop: "product-two" },
  { id: "sku_spf_07", name: "Cloudveil SPF 50", detail: "50 g · No white cast", price: 59_900, tags: ["sensitive-skin", "fragrance-free"], stock: 23, deliveryDays: 2, crop: "product-three" },
  { id: "sku_barrier_02", name: "Calm Barrier Serum", detail: "30 ml · Ceramide complex", price: 74_900, tags: ["sensitive-skin", "ceramides", "fragrance-free"], stock: 11, deliveryDays: 2, crop: "product-two" },
];

export const defaultReasons: Record<string, string> = {
  sku_cleanser_01: "Fragrance-free and suited to sensitive skin",
  sku_serum_04: "Adds a gift-worthy treatment within budget",
  sku_spf_07: "Completes a practical morning routine",
  sku_barrier_02: "A gentle, in-stock alternative at the same price",
};

export function catalogueProduct(id: string) {
  return catalogue.find((product) => product.id === id);
}

export function normalizeLines(lines: CartLine[]) {
  const quantities = new Map<string, number>();
  for (const line of lines) quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.quantity);
  return [...quantities].filter(([, quantity]) => quantity > 0).map(([productId, quantity]) => ({ productId, quantity }));
}

export function evaluateCart(lines: CartLine[], budget = DEFAULT_BUDGET, forcedUnavailable: string[] = []): PolicyResult & { total: number } {
  const normalized = normalizeLines(lines);
  const missing = normalized.filter((line) => !catalogueProduct(line.productId));
  const quantitiesValid = missing.length === 0 && normalized.every((line) => Number.isInteger(line.quantity) && line.quantity >= 1 && line.quantity <= 3);
  const total = quantitiesValid
    ? normalized.reduce((sum, line) => sum + (catalogueProduct(line.productId)?.price ?? 0) * line.quantity, 0)
    : 0;
  const stockValid = quantitiesValid && normalized.every((line) => {
    const product = catalogueProduct(line.productId);
    return Boolean(product && product.stock >= line.quantity && !forcedUnavailable.includes(line.productId));
  });
  const deliveryValid = quantitiesValid && normalized.every((line) => (catalogueProduct(line.productId)?.deliveryDays ?? 99) <= 4);
  const withinBudget = quantitiesValid && total <= budget;
  const violations = [
    ...(!quantitiesValid ? ["Cart contains an unknown product or invalid quantity."] : []),
    ...(!withinBudget ? ["Cart exceeds the buyer-approved budget."] : []),
    ...(!stockValid ? ["One or more products are no longer available."] : []),
    ...(!deliveryValid ? ["The delivery promise cannot be met."] : []),
  ];
  return { total, withinBudget, stockValid, deliveryValid, quantitiesValid, approvalRequired: true, passed: violations.length === 0, violations };
}

export function displayCart(lines: CartLine[], reasons: Record<string, string> = defaultReasons): DisplayCartItem[] {
  return normalizeLines(lines).flatMap((line) => {
    const product = catalogueProduct(line.productId);
    return product ? [{ ...product, quantity: line.quantity, reason: reasons[product.id] ?? defaultReasons[product.id] }] : [];
  });
}

export function repairUnavailableSerum(lines: CartLine[]) {
  return normalizeLines(lines.map((line) => line.productId === "sku_serum_04" ? { ...line, productId: "sku_barrier_02" } : line));
}
