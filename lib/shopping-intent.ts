import { catalogue, DEFAULT_BUDGET, evaluateCart, normalizeLines, type CartLine } from "./commerce";

const categories = {
  cleanser: /\b(?:cleanser|cleansers|face wash)\b/i,
  serum: /\bserums?\b/i,
  sunscreen: /\b(?:sunscreens?|spf)\b/i,
  wrap: /\b(?:gift[ -]?wrap|wrapping)\b/i,
};
type Category = keyof typeof categories;
export function sameProductCategory(first: string, second: string) {
  return Boolean(categoryById[first] && categoryById[first] === categoryById[second]);
}
const categoryById: Record<string, Category> = {
  sku_cleanser_01: "cleanser", sku_serum_04: "serum", sku_barrier_02: "serum", sku_spf_07: "sunscreen", sku_wrap_01: "wrap",
};

// Deliberately bounded parser for this catalogue. Unsupported requests ask for
// clarification instead of letting a model invent authoritative constraints.
export function parseShoppingIntent(text: string, at = new Date()) {
  const amount = text.match(/(?:₹|\bINR\s*|\bRs\.?\s*|\b(?:budget|under|below|at most|up to)\s*(?:of\s*)?)(\d[\d,]*(?:\.\d{1,2})?)\s*(k\b)?/i);
  const budget = amount ? Math.round(Number(amount[1].replaceAll(",", "")) * (amount[2] ? 1000 : 1) * 100) : DEFAULT_BUDGET;
  const excluded = new Set<Category>();
  const positive: string[] = [];
  for (const clause of text.split(/[.!?;]|\bbut\b/i)) {
    const negation = clause.search(/\b(?:no|without|exclude|excluding|skip|avoid|don't want|do not want)\b/i);
    positive.push(negation < 0 ? clause : clause.slice(0, negation));
    if (negation >= 0) for (const [category, pattern] of Object.entries(categories)) {
      if (pattern.test(clause.slice(negation))) excluded.add(category as Category);
    }
  }
  const requested = (Object.keys(categories) as Category[]).filter((category) => categories[category].test(positive.join(" ")));
  const sensitive = /\bsensitive[ -]skin\b|\bskin is sensitive\b/i.test(text);
  const fragranceFree = /\b(?:fragrance[ -]free|no fragrance|without fragrance)\b/i.test(text);
  let deliveryDays: number | null = null;
  const days = text.match(/\b(?:within|in)\s+(\d+)\s+days?\b/i);
  if (days) deliveryDays = Number(days[1]);
  if (/\btomorrow\b/i.test(text)) deliveryDays = 1;
  if (/\b(?:today|same[ -]day)\b/i.test(text)) deliveryDays = 0;
  const weekday = text.match(/\b(by|before|on)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
  if (weekday) {
    const target = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(weekday[2].toLowerCase());
    deliveryDays = (target - at.getUTCDay() + 7) % 7;
    if (weekday[1].toLowerCase() === "before") deliveryDays -= 1;
  }
  const supported = requested.length > 0 || /\b(?:skincare|skin care|skin-care|beauty|routine|ritual)\b/i.test(text) || sensitive;
  const error = !Number.isSafeInteger(budget) || budget <= 0 || budget > 100_000_000
    ? "Please specify a budget between ₹0.01 and ₹10,00,000."
    : /[$€£]|\b(?:USD|EUR|GBP)\b/i.test(text)
      ? "This catalogue uses INR. Please specify your budget in rupees."
      : !supported ? "This catalogue has cleansers, serums, sunscreen and gift wrap. Please name the products you want."
        : /\b(?:\d+|two|three|four|five)\s+(?:bottles?\s+of\s+)?(?:cleansers?|serums?|sunscreens?|gift wraps?)\b/i.test(text)
          ? "Build a product selection first, then set the quantities with the cart controls (up to 3 per product)."
          : /\b(?:deliver|delivered|delivery|arrive|arrives)\b/i.test(text) && deliveryDays === null
            ? "Please give delivery as within a number of days, today, tomorrow, or by a weekday."
            : null;
  return { budget, budgetSpecified: Boolean(amount), requested, excluded: [...excluded], sensitive, fragranceFree, deliveryDays, error };
}

export function eligibleProducts(intent: ReturnType<typeof parseShoppingIntent>) {
  return catalogue.filter((product) => {
    const category = categoryById[product.id];
    return !intent.excluded.includes(category)
      && (!intent.requested.length || intent.requested.includes(category))
      && (!(intent.sensitive || intent.fragranceFree) || category === "wrap" || product.tags.includes(intent.sensitive ? "sensitive-skin" : "fragrance-free"))
      && (!intent.fragranceFree || category === "wrap" || product.tags.includes("fragrance-free"))
      && (intent.deliveryDays === null || product.deliveryDays <= intent.deliveryDays)
      && product.stock > 0;
  });
}

export function evaluateIntentCart(lines: CartLine[], text: string, budget: number, at = new Date(), unavailable: string[] = []) {
  const intent = parseShoppingIntent(text, at);
  const policy = evaluateCart(lines, budget, unavailable);
  policy.unavailableProductIds = [...unavailable];
  const allowed = new Set(eligibleProducts(intent).map((product) => product.id));
  const matches = !intent.error && normalizeLines(lines).every((line) => allowed.has(line.productId));
  if (!matches) {
    policy.passed = false;
    policy.violations.push(intent.error ?? "Cart conflicts with the requested products, exclusions or delivery limit.");
  }
  return policy;
}

export function fallbackRecommendation(intent: ReturnType<typeof parseShoppingIntent>) {
  let remaining = intent.budget;
  const chosen = new Set<Category>();
  const products = eligibleProducts(intent).filter((product) => {
    const category = categoryById[product.id];
    if (chosen.has(category) || (category === "wrap" && !intent.requested.includes("wrap")) || product.price > remaining) return false;
    chosen.add(category);
    remaining -= product.price;
    return true;
  });
  return {
    cart: intent.requested.every((category) => chosen.has(category)) ? products.map((product) => product.id) : [], title: "Catalogue selection for your request", fitScore: 0,
    reasons: Object.fromEntries(products.map((product) => [product.id, "Matches the supported request filters and fits within the remaining budget."])),
    rejected: [],
  };
}

export function coversRequestedCategories(ids: string[], intent: ReturnType<typeof parseShoppingIntent>) {
  return intent.requested.every((category) => ids.some((id) => categoryById[id] === category));
}
