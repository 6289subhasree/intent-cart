"use client";

import { useState } from "react";
import {
  ArrowRight, Bot, Check, CheckCircle2, ChevronDown, CircleDollarSign, Clock3, CreditCard, Gift, Minus,
  PackageCheck, Plus, RefreshCw, Search, ShieldCheck, ShoppingBag, Sparkles, Tag, Trash2, TriangleAlert,
  UserRound, WalletCards, Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { eligibleProducts, parseShoppingIntent } from "@/lib/shopping-intent";

type Product = {
  id: string; name: string; detail: string; price: number; crop: string; reason: string; quantity: number; deliveryDays?: number;
};

type Policy = {
  withinBudget: boolean; stockValid: boolean; deliveryValid: boolean; quantitiesValid: boolean; passed: boolean; violations: string[];
};

type SessionPayload = {
  id: string; intent: string; title: string; status: "ready" | "blocked" | "approved" | "ordered"; budget: number; total: number;
  cartVersion: string; fitScore: number; mode: "ai" | "deterministic_fallback"; policy: Policy; items: Product[];
};

const starterProducts: Product[] = [
  { id: "sku_cleanser_01", name: "Dewdrop Cleanser", detail: "120 ml · Gentle daily wash", price: 54_900, crop: "product-one", reason: "Fragrance-free and suited to sensitive skin", quantity: 1 },
  { id: "sku_serum_04", name: "Bright C Serum", detail: "30 ml · 10% vitamin C", price: 74_900, crop: "product-two", reason: "Adds a gift-worthy treatment within budget", quantity: 1 },
  { id: "sku_spf_07", name: "Cloudveil SPF 50", detail: "50 g · No white cast", price: 59_900, crop: "product-three", reason: "Completes a practical morning routine", quantity: 1 },
];

const defaultIntent = "Build a skincare gift for my sister under ₹2,000. She has sensitive skin, and I need it delivered by Friday.";
const money = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;

export default function DemoPage() {
  const [request, setRequest] = useState(defaultIntent);
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [products, setProducts] = useState(starterProducts);
  const [stage, setStage] = useState<"ready" | "thinking" | "built">("ready");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paid, setPaid] = useState(false);
  const [repaired, setRepaired] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const total = session?.total ?? products.reduce((sum, product) => sum + product.price * product.quantity, 0);
  const draftConstraints = parseShoppingIntent(request);
  const budget = session?.budget ?? (draftConstraints.budget > 0 ? draftConstraints.budget : 200_000);
  const remaining = budget - total;
  const draftChanged = Boolean(session && request.trim() !== session.intent.trim());
  // The sidebar follows the draft; cart offers follow the saved request too.
  const occasion = request.match(/\b(?:birthday|anniversary|wedding)\b/i)?.[0]
    ?? request.match(/\bgift\s+for\s+(?:my\s+)?[a-z]+/i)?.[0]
    ?? "Not specified";
  const deliveryRequest = request.match(/\b(?:deliver(?:ed|y)?|arriv(?:e|es|al))\s+(?:it\s+)?(?:by|before|on|within)\s+[^.!?;]+/i)?.[0]
    ?? "Not specified";
  const excludesWrap = (text: string) =>
    /\b(?:no|without|exclude|skip|avoid|don't|do not)\b[^.!?;]*\b(?:gift[ -]?wrap|wrapping)\b/i.test(text)
    || /\bonly\b/i.test(text);
  const showGiftWrap = !draftChanged && !excludesWrap(request) && !excludesWrap(session?.intent ?? request)
    && eligibleProducts(parseShoppingIntent(session?.intent ?? request)).some((product) => product.id === "sku_wrap_01")
    && /\bgift\b/i.test(session?.intent ?? request)
    && !products.some((product) => product.id === "sku_wrap_01" && product.quantity > 0)
    && remaining >= 7900;
  const deliveryDays = Math.max(0, ...products.filter((product) => product.quantity > 0).map((product) => product.deliveryDays ?? 0));
  const deliveryEstimate = session && deliveryDays ? `Estimated delivery: ${deliveryDays} days` : "Delivery estimate unavailable";
  const inventoryFailure = session?.status === "blocked" && !session.policy.stockValid;

  function applySession(next: SessionPayload) {
    setSession(next);
    setProducts(next.items);
    setStage("built");
  }

  async function postJson<T = SessionPayload>(url: string, body: unknown): Promise<T> {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json() as T & { error?: string };
    if (!response.ok) throw new Error(result.error ?? "That action could not be completed.");
    return result;
  }

  async function buildCart() {
    if (busyAction || stage === "thinking") return;
    setSession(null); setProducts([]); setCheckoutOpen(false);
    setStage("thinking"); setError(null); setPaid(false); setRepaired(false);
    try {
      applySession(await postJson("/api/agent", { intent: request }));
    } catch (cause) {
      setStage("ready"); setError(cause instanceof Error ? cause.message : "The cart could not be built.");
    }
  }

  async function changeCart(action: "update" | "conflict" | "repair", nextProducts = products) {
    if (!session || draftChanged || busyAction || stage === "thinking") return;
    setBusyAction(action); setError(null);
    try {
      const next = await postJson("/api/cart", {
        sessionId: session.id, cartVersion: session.cartVersion, action,
        items: nextProducts.map((product) => ({ productId: product.id, quantity: product.quantity })),
      });
      applySession(next);
      if (action === "repair") setRepaired(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The cart could not be updated.");
    } finally { setBusyAction(null); }
  }

  function updateQuantity(id: string, delta: number) {
    const next = products.map((product) => product.id === id ? { ...product, quantity: Math.max(0, Math.min(3, product.quantity + delta)) } : product);
    void changeCart("update", next);
  }

  function addGiftWrap() {
    if (!showGiftWrap) return;
    const existing = products.find((product) => product.id === "sku_wrap_01");
    const next = existing
      ? products.map((product) => product.id === existing.id ? { ...product, quantity: Math.min(3, product.quantity + 1) } : product)
      : [...products, { id: "sku_wrap_01", name: "Reusable Gift Wrap", detail: "Cotton wrap · Gift note included", price: 7_900, crop: "product-one", reason: "Adds a finished gift experience without breaking the budget", quantity: 1 }];
    void changeCart("update", next);
  }

  async function approvePayment() {
    if (!session || draftChanged || busyAction || stage === "thinking") return;
    setBusyAction("checkout"); setError(null);
    try {
      await postJson("/api/checkout", { sessionId: session.id, cartVersion: session.cartVersion, approval: true });
      setPaid(true);
      setSession({ ...session, status: "ordered" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The test order stopped safely.");
    } finally { setBusyAction(null); }
  }

  const auditHref = session ? `/audit?sessionId=${encodeURIComponent(session.id)}` : "/audit";

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="IntentCart home"><span className="brand-glyph"><ShoppingBag size={19} strokeWidth={2.3} /></span><span>Intent<span>Cart</span></span></a>
        <nav aria-label="Primary"><a className="active" href="#shop">Shop with AI</a><a href={auditHref}>Audit trail</a><a href="/merchant">Merchant view</a></nav>
        <div className="top-actions"><button className="merchant-pill"><span>NV</span> Nova Beauty <ChevronDown size={14} /></button><button className="profile-button" aria-label="Profile"><UserRound size={18} /></button></div>
      </header>

      <section className="workspace" id="shop">
        <aside className="intent-panel">
          <div className="panel-kicker"><Bot size={16} /> Shopping agent</div>
          <h1>What should I find for you?</h1>
          <p>Describe the person, occasion, budget and delivery need. IntentCart handles the rest.</p>
          <label className="intent-box"><span className="sr-only">Shopping request</span><textarea disabled={stage === "thinking" || busyAction !== null} value={request} onChange={(event) => setRequest(event.target.value)} rows={7} maxLength={500} /><div><span><Zap size={13} /> Agent-ready catalogue</span><span>{request.length}/500</span></div></label>
          <div className="constraint-list"><button><CircleDollarSign /><span><small>Budget</small>{session ? money(budget) : "Read from your request"}</span><Check size={15} /></button><button><Gift /><span><small>Occasion mentioned</small>{occasion}</span><Check size={15} /></button><button><Clock3 /><span><small>Requested delivery</small>{deliveryRequest}</span><Check size={15} /></button></div>
          <Button className="build-button" onClick={buildCart} disabled={busyAction !== null || stage === "thinking" || request.trim().length < 8}>{stage === "thinking" ? <Sparkles className="pulse" /> : <Search />}{stage === "thinking" ? "Comparing products…" : session ? "Build a new cart" : "Build my cart"}</Button>
          <div className="trust-note"><ShieldCheck size={15} /><span><strong>You stay in control.</strong> Recommendations can change the cart, but spending requires approval of the current version.</span></div>
          <button className="failure-trigger" disabled={draftChanged || !session || busyAction !== null} onClick={() => void changeCart("conflict")}><TriangleAlert />Trigger inventory conflict</button>
          {draftChanged && <p role="status">Your request changed. Build a new cart before editing or checking out.</p>}
          {error && <div className="inline-error" role="alert"><TriangleAlert />{error}</div>}
        </aside>

        <section className="cart-panel" aria-live="polite">
          {stage === "thinking" ? (
            <div className="thinking-state"><span className="thinking-orbit"><Bot /></span><h2>Building the best-fit cart</h2><p>Checking catalogue fit, inventory and price.</p><Progress value={67} /><div className="thinking-steps"><span><Check /> Intent understood</span><span><Check /> Catalogue compared</span><span className="current"><Sparkles /> Evaluating bundles</span></div></div>
          ) : <>
            <div className="cart-heading"><div><Badge className="agent-badge"><Sparkles />{session ? "Agent-built cart" : "Example cart"}</Badge>{session && <Badge variant="outline" className="mode-badge">{session.mode === "ai" ? "AI recommendation" : "Reliable fallback"}</Badge>}<h2>{session?.title ?? (products.length ? "A sensitive-skin starter ritual" : "No cart built")}</h2><p>{session ? `${session.id} · saved and policy-checked` : "Build the cart to start a persisted shopping session."}</p></div><div className="fit-score"><span>{session?.policy.passed ? <Check /> : "—"}</span><small>policy</small></div></div>
            <div className="reason-strip"><span><ShieldCheck /> Catalogue products</span><span><PackageCheck />{deliveryEstimate}</span><span><WalletCards />{session ? session.policy.withinBudget ? "Within budget" : "Over budget" : "Budget check pending"}</span></div>
            {inventoryFailure && <div className="failure-banner" role="alert"><TriangleAlert /><span><strong>Inventory changed before checkout</strong>Bright C Serum is unavailable. The server paused payment and recorded the failure.</span><Button size="sm" disabled={busyAction !== null} onClick={() => void changeCart("repair")}><RefreshCw />{busyAction === "repair" ? "Repairing…" : "Repair cart"}</Button></div>}
            {repaired && !inventoryFailure && <div className="repair-banner" role="status"><CheckCircle2 /><span><strong>Cart repaired and revalidated</strong>The unavailable serum was replaced, the budget was checked again, and approval was reset.</span></div>}
            <div className="product-list">{products.filter((product) => product.quantity > 0).map((product) => <article className="product-row" key={product.id}><div className={`product-image ${product.crop}`} role="img" aria-label={`${product.name} product photo`} /><div className="product-copy"><div className="product-title"><div><h3>{product.name}</h3><p>{product.detail}</p></div><strong>{money(product.price)}</strong></div><div className="agent-reason"><Sparkles size={13} /><span>{product.reason}</span></div></div><div className="quantity-control" aria-label={`Quantity of ${product.name}`}><button disabled={draftChanged || !session || busyAction !== null} onClick={() => updateQuantity(product.id, -1)} aria-label={`Remove one ${product.name}`}>{product.quantity === 1 ? <Trash2 /> : <Minus />}</button><span>{product.quantity}</span><button disabled={draftChanged || !session || busyAction !== null} onClick={() => updateQuantity(product.id, 1)} aria-label={`Add one ${product.name}`}><Plus /></button></div></article>)}</div>
            {showGiftWrap && <div className="upsell-card"><div className="upsell-icon"><Tag /></div><div><Badge variant="outline">Bounded upsell</Badge><h3>Add reusable gift wrap for ₹79?</h3><p>The server checks the new total before it changes your saved cart.</p></div><Button variant="outline" size="sm" disabled={draftChanged || !session || busyAction !== null} onClick={addGiftWrap}>Add</Button></div>}
          </>}
        </section>

        <aside className="order-panel">
          <div className="order-head"><h2>Your order</h2><Badge variant="outline">Test checkout</Badge></div>
          <div className="budget-card"><div><span>Budget used</span><strong>{money(total)} <small>/ {money(budget)}</small></strong></div><Progress value={Math.min(100, (total / budget) * 100)} /><p className={remaining < 0 ? "over-budget" : ""}>{remaining >= 0 ? `${money(remaining)} safely remaining` : `${money(Math.abs(remaining))} over your limit`}</p></div>
          <div className="price-lines"><div><span>Subtotal</span><strong>{money(total)}</strong></div><div><span>Delivery</span><strong className="free">FREE</strong></div><div><span>Estimated tax</span><strong>Included</strong></div></div><div className="total-line"><span>Total</span><strong>{money(total)}</strong></div>
          <div className="delivery-card"><PackageCheck /><div><strong>{deliveryEstimate}</strong><p>Catalogue estimate; arrival date is not guaranteed</p></div><CheckCircle2 /></div>
          <div className="approval-flow"><h3>Checkout guardrails</h3><div><span><Check />Cart is within {money(budget)}</span><Badge>{session?.policy.withinBudget ? "Passed" : "Pending"}</Badge></div><div><span>{inventoryFailure ? <TriangleAlert /> : <Check />}{inventoryFailure ? "Inventory conflict detected" : "All items are in stock"}</span><Badge variant={inventoryFailure ? "outline" : "default"}>{inventoryFailure ? "Blocked" : session ? "Passed" : "Pending"}</Badge></div><div><span><ShieldCheck />Explicit approval required</span><Badge variant="outline">{paid ? "Approved" : "Waiting"}</Badge></div></div>
          <Button className="checkout-button" onClick={() => { setPaid(false); setError(null); setCheckoutOpen(true); }} disabled={draftChanged || !session || !session.policy.passed || session.status === "ordered" || busyAction !== null}>Review & approve <ArrowRight /></Button>
          <p className="checkout-note"><CreditCard /> Test checkout · No live charge</p>
        </aside>
      </section>

      <section className="audit-bar" id="audit"><div><span className="audit-icon"><ShieldCheck /></span><div><strong>Every action joins one trace</strong><p>Recommendation, edits, policy decisions, approval and order creation share the same session ID.</p></div></div><div className="audit-events"><span><Check /> Intent parsed</span><i /><span><Check /> Cart bounded</span><i /><span className="pending-dot" />{paid ? "Order recorded" : "Approval pending"}</div><a href={auditHref}>Open audit trail <ArrowRight size={15} /></a></section>

      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}><DialogContent className="checkout-dialog">{paid ? <div className="paid-state"><span><Check /></span><h2>Order created</h2><p>{session?.id} is complete. The recommendation, approval, exact amount and order are stored in one trace.</p><a className="trace-link" href={auditHref}>View audit trail <ArrowRight /></a></div> : <><DialogHeader><Badge className="checkout-badge">TEST CHECKOUT</Badge><DialogTitle>Approve {money(total)} checkout</DialogTitle><DialogDescription>This approval applies only to {session?.cartVersion}. Any later cart change invalidates it.</DialogDescription></DialogHeader><div className="dialog-summary"><span>Nova Beauty</span><strong>{money(total)}</strong><p>{products.reduce((sum, product) => sum + product.quantity, 0)} items · {deliveryEstimate}</p></div><div className="payment-method"><span className="card-chip"><CreditCard /></span><div><strong>Test Visa</strong><p>•••• 1111</p></div><CheckCircle2 /></div><div className="dialog-guardrail"><ShieldCheck /><span><strong>Server-verified checkout</strong>The server reloads this cart, recalculates the total, and checks its current version before creating an order.</span></div>{error && <div className="checkout-error"><TriangleAlert /><span><strong>Checkout stopped safely</strong>{error}</span></div>}<DialogFooter><Button variant="outline" onClick={() => setCheckoutOpen(false)}>Cancel</Button><Button className="pay-button" disabled={draftChanged || busyAction !== null} onClick={approvePayment}>{busyAction === "checkout" ? "Verifying…" : "Approve test order"} <ArrowRight /></Button></DialogFooter></>}</DialogContent></Dialog>
    </main>
  );
}
