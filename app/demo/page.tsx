"use client";

import { useState } from "react";
import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Gift,
  Minus,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Tag,
  Trash2,
  TriangleAlert,
  UserRound,
  WalletCards,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

type Product = {
  id: number;
  name: string;
  detail: string;
  price: number;
  crop: string;
  reason: string;
};

const products: Product[] = [
  { id: 1, name: "Dewdrop Cleanser", detail: "120 ml · Gentle daily wash", price: 549, crop: "product-one", reason: "Fragrance-free and suited to sensitive skin" },
  { id: 2, name: "Bright C Serum", detail: "30 ml · 10% vitamin C", price: 749, crop: "product-two", reason: "Adds a gift-worthy treatment within budget" },
  { id: 3, name: "Cloudveil SPF 50", detail: "50 g · No white cast", price: 599, crop: "product-three", reason: "Completes a practical morning routine" },
];

const intent = "Build a skincare gift for my sister under ₹2,000. She has sensitive skin, and I need it delivered by Friday.";

export default function Home() {
  const [request, setRequest] = useState(intent);
  const [quantities, setQuantities] = useState<Record<number, number>>({ 1: 1, 2: 1, 3: 1 });
  const [stage, setStage] = useState<"ready" | "thinking" | "built">("built");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paid, setPaid] = useState(false);
  const [inventoryFailure, setInventoryFailure] = useState(false);
  const [repaired, setRepaired] = useState(false);
  const [agentMode, setAgentMode] = useState<"ai" | "deterministic_fallback" | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const activeProducts = repaired
    ? products.map((product) => product.id === 2
      ? { ...product, name: "Calm Barrier Serum", detail: "30 ml · Ceramide complex", reason: "Safe in-stock alternative at the same price" }
      : product)
    : products;

  const subtotal = activeProducts.reduce((sum, product) => sum + product.price * (quantities[product.id] ?? 0), 0);
  const delivery = subtotal > 0 ? 0 : 0;
  const total = subtotal + delivery;
  const remaining = 2000 - total;

  function updateQuantity(id: number, delta: number) {
    setQuantities((current) => ({ ...current, [id]: Math.max(0, Math.min(3, (current[id] ?? 0) + delta)) }));
  }

  async function buildCart() {
    setStage("thinking");
    try {
      const response = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: request }) });
      const result = await response.json();
      setAgentMode(result.mode === "ai" ? "ai" : "deterministic_fallback");
    } finally {
      window.setTimeout(() => setStage("built"), 500);
    }
  }

  async function approvePayment() {
    setCheckoutError(null);
    try {
      const response = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: total * 100, approval: true, cartVersion: repaired ? "IC-2048-r1" : "IC-2048" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Test order failed safely.");
      setPaid(true);
      window.setTimeout(() => setCheckoutOpen(false), 1500);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Test order failed safely.");
    }
  }

  function repairCart() {
    setStage("thinking");
    window.setTimeout(() => {
      setInventoryFailure(false);
      setRepaired(true);
      setStage("built");
    }, 850);
  }

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="IntentCart home">
          <span className="brand-glyph"><ShoppingBag size={19} strokeWidth={2.3} /></span>
          <span>Intent<span>Cart</span></span>
        </a>
        <nav aria-label="Primary">
          <a className="active" href="#shop">Shop with AI</a>
          <a href="/audit">Audit trail</a>
          <a href="/merchant">Merchant view</a>
        </nav>
        <div className="top-actions">
          <button className="merchant-pill"><span>NV</span> Nova Beauty <ChevronDown size={14} /></button>
          <button className="profile-button" aria-label="Profile"><UserRound size={18} /></button>
        </div>
      </header>

      <section className="workspace" id="shop">
        <aside className="intent-panel">
          <div className="panel-kicker"><Bot size={16} /> Shopping agent</div>
          <h1>What should I find for you?</h1>
          <p>Describe the person, occasion, budget and delivery need. IntentCart handles the rest.</p>

          <label className="intent-box">
            <span className="sr-only">Shopping request</span>
            <textarea value={request} onChange={(event) => setRequest(event.target.value)} rows={7} />
            <div>
              <span><Zap size={13} /> Agent-ready catalogue</span>
              <span>{request.length}/240</span>
            </div>
          </label>

          <div className="constraint-list">
            <button><CircleDollarSign /><span><small>Budget</small>Under ₹2,000</span><Check size={15} /></button>
            <button><Gift /><span><small>Occasion</small>Gift for sister</span><Check size={15} /></button>
            <button><Clock3 /><span><small>Delivery</small>Before Friday</span><Check size={15} /></button>
          </div>

          <Button className="build-button" onClick={buildCart} disabled={stage === "thinking" || !request.trim()}>
            {stage === "thinking" ? <Sparkles className="pulse" /> : <Search />}
            {stage === "thinking" ? "Comparing 42 products…" : "Build my cart"}
          </Button>

          <div className="trust-note"><ShieldCheck size={15} /><span><strong>You stay in control.</strong> IntentCart can recommend, but it cannot spend or exceed your limits without approval.</span></div>
          <button className="failure-trigger" onClick={() => { setInventoryFailure(true); setRepaired(false); }}><TriangleAlert /> Simulate inventory conflict</button>
        </aside>

        <section className="cart-panel" aria-live="polite">
          {stage === "thinking" ? (
            <div className="thinking-state">
              <span className="thinking-orbit"><Bot /></span>
              <h2>Building the best-fit cart</h2>
              <p>Checking ingredients, inventory, price and Friday delivery.</p>
              <Progress value={67} />
              <div className="thinking-steps"><span><Check /> Intent understood</span><span><Check /> 42 products compared</span><span className="current"><Sparkles /> Evaluating bundles</span></div>
            </div>
          ) : (
            <>
              <div className="cart-heading">
                <div>
                  <Badge className="agent-badge"><Sparkles /> AI-built cart</Badge>
                  {agentMode && <Badge variant="outline" className="mode-badge">{agentMode === "ai" ? "AI online" : "Safe demo fallback"}</Badge>}
                  <h2>A sensitive-skin starter ritual</h2>
                  <p>Three complementary products, all in stock and deliverable before Friday.</p>
                </div>
                <div className="fit-score"><span>96</span><small>fit score</small></div>
              </div>

              <div className="reason-strip">
                <span><ShieldCheck /> No fragrance</span>
                <span><PackageCheck /> Friday delivery</span>
                <span><WalletCards /> Within budget</span>
              </div>

              {inventoryFailure && (
                <div className="failure-banner" role="alert"><TriangleAlert /><span><strong>Inventory changed before checkout</strong>Bright C Serum sold out. Payment is paused until the cart is revalidated.</span><Button size="sm" onClick={repairCart}><RefreshCw />Repair cart</Button></div>
              )}
              {repaired && !inventoryFailure && (
                <div className="repair-banner" role="status"><CheckCircle2 /><span><strong>Cart repaired safely</strong>Replaced the unavailable serum, rechecked the same ₹2,000 bound and preserved Thursday delivery.</span></div>
              )}

              <div className="product-list">
                {activeProducts.map((product) => {
                  const quantity = quantities[product.id] ?? 0;
                  return (
                    <article className={`product-row ${quantity === 0 ? "removed" : ""}`} key={product.id}>
                      <div className={`product-image ${product.crop}`} role="img" aria-label={`${product.name} product photo`} />
                      <div className="product-copy">
                        <div className="product-title"><div><h3>{product.name}</h3><p>{product.detail}</p></div><strong>₹{product.price}</strong></div>
                        <div className="agent-reason"><Sparkles size={13} /><span>{product.reason}</span></div>
                      </div>
                      <div className="quantity-control" aria-label={`Quantity of ${product.name}`}>
                        <button onClick={() => updateQuantity(product.id, -1)} aria-label={`Remove one ${product.name}`}>{quantity === 1 ? <Trash2 /> : <Minus />}</button>
                        <span>{quantity}</span>
                        <button onClick={() => updateQuantity(product.id, 1)} aria-label={`Add one ${product.name}`}><Plus /></button>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="upsell-card">
                <div className="upsell-icon"><Tag /></div>
                <div><Badge variant="outline">Bounded upsell</Badge><h3>Add reusable gift wrap for ₹79?</h3><p>Keeps your cart under budget. IntentCart won’t add it unless you say yes.</p></div>
                <Button variant="outline" size="sm">Add</Button>
              </div>
            </>
          )}
        </section>

        <aside className="order-panel">
          <div className="order-head"><h2>Your order</h2><Badge variant="outline">Test mode</Badge></div>
          <div className="budget-card">
            <div><span>Budget used</span><strong>₹{total.toLocaleString("en-IN")} <small>/ ₹2,000</small></strong></div>
            <Progress value={Math.min(100, (total / 2000) * 100)} />
            <p className={remaining < 0 ? "over-budget" : ""}>{remaining >= 0 ? `₹${remaining.toLocaleString("en-IN")} safely remaining` : `₹${Math.abs(remaining).toLocaleString("en-IN")} over your limit`}</p>
          </div>

          <div className="price-lines">
            <div><span>Subtotal</span><strong>₹{subtotal.toLocaleString("en-IN")}</strong></div>
            <div><span>Delivery</span><strong className="free">FREE</strong></div>
            <div><span>Estimated tax</span><strong>Included</strong></div>
          </div>
          <div className="total-line"><span>Total</span><strong>₹{total.toLocaleString("en-IN")}</strong></div>

          <div className="delivery-card"><PackageCheck /><div><strong>Arrives by Thursday</strong><p>One day before your deadline</p></div><CheckCircle2 /></div>

          <div className="approval-flow">
            <h3>Checkout guardrails</h3>
            <div><span><Check />Cart is under ₹2,000</span><Badge>Passed</Badge></div>
            <div><span>{inventoryFailure ? <TriangleAlert /> : <Check />}{inventoryFailure ? "Inventory conflict detected" : "All items are in stock"}</span><Badge variant={inventoryFailure ? "outline" : "default"}>{inventoryFailure ? "Blocked" : "Passed"}</Badge></div>
            <div><span><ShieldCheck />Explicit approval required</span><Badge variant="outline">Waiting</Badge></div>
          </div>

          <Button className="checkout-button" onClick={() => { setPaid(false); setCheckoutOpen(true); }} disabled={total <= 0 || remaining < 0 || inventoryFailure}>
            Review & approve <ArrowRight />
          </Button>
          <p className="razor-note"><CreditCard /> Razorpay test checkout · No real charge</p>
        </aside>
      </section>

      <section className="audit-bar" id="audit">
        <div><span className="audit-icon"><ShieldCheck /></span><div><strong>Every agent action is explainable</strong><p>Catalogue read, product ranking, budget check, upsell and approval are recorded.</p></div></div>
        <div className="audit-events"><span><Check /> Intent parsed</span><i /><span><Check /> Cart bounded</span><i /><span className="pending-dot" /> Approval pending</div>
        <a href="/audit">Open audit trail <ArrowRight size={15} /></a>
      </section>

      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="checkout-dialog">
          {paid ? (
            <div className="paid-state"><span><Check /></span><h2>Payment authorised</h2><p>Test order #IC-2048 has been created and the complete agent trail is saved.</p></div>
          ) : (
            <>
              <DialogHeader>
                <Badge className="razor-badge">Razorpay · TEST MODE</Badge>
                <DialogTitle>Approve ₹{total.toLocaleString("en-IN")} checkout</DialogTitle>
                <DialogDescription>IntentCart cannot complete this payment without your explicit confirmation.</DialogDescription>
              </DialogHeader>
              <div className="dialog-summary"><span>Nova Beauty</span><strong>₹{total.toLocaleString("en-IN")}</strong><p>{Object.values(quantities).reduce((a, b) => a + b, 0)} products · delivery by Thursday</p></div>
              <div className="payment-method"><span className="card-chip"><CreditCard /></span><div><strong>Test Visa</strong><p>•••• 1111</p></div><CheckCircle2 /></div>
              <div className="dialog-guardrail"><ShieldCheck /><span><strong>Bounded checkout</strong>This amount matches the approved cart and is below your ₹2,000 limit.</span></div>
              {checkoutError && <div className="checkout-error"><TriangleAlert /><span><strong>Payment stopped safely</strong>{checkoutError}</span></div>}
              <DialogFooter>
                <Button variant="outline" onClick={() => setCheckoutOpen(false)}>Cancel</Button>
                <Button className="pay-button" onClick={approvePayment}>Approve test payment <ArrowRight /></Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
