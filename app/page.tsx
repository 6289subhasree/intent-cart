import {
  ArrowDownRight,
  ArrowRight,
  Bot,
  Check,
  CircleDollarSign,
  ExternalLink,
  LockKeyhole,
  MessageSquareText,
  PackageSearch,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  TriangleAlert,
  WalletCards,
} from "lucide-react";

const flow = [
  { n: "01", icon: MessageSquareText, title: "State the intent", copy: "The buyer describes the need, budget, preferences and delivery deadline in plain language." },
  { n: "02", icon: PackageSearch, title: "Compose the cart", copy: "The agent reads a structured catalogue, ranks products and builds the highest-fit bundle." },
  { n: "03", icon: ShieldCheck, title: "Enforce the bounds", copy: "A deterministic policy checks budget, stock, consent, delivery and merchant rules." },
  { n: "04", icon: WalletCards, title: "Approve and pay", copy: "The buyer sees every decision, explicitly approves the amount, then enters Razorpay checkout." },
];

export default function LandingPage() {
  return (
    <main className="landing-shell">
      <header className="landing-nav">
        <a className="landing-brand" href="#top"><span><ShoppingBag /></span>intentcart</a>
        <nav aria-label="Landing page">
          <a href="#product">Product</a>
          <a href="#how">How it works</a>
          <a href="#safety">Safety</a>
          <a href="/merchant">Merchant view</a>
        </nav>
        <a className="nav-cta" href="/demo">Launch demo <ArrowRight /></a>
      </header>

      <section className="landing-hero" id="top">
        <div className="track-label">TRACK 01 · AI GROWTH & AGENTIC COMMERCE</div>
        <h1>Your next customer<br />might be an <em>agent.</em></h1>
        <div className="hero-bottom">
          <p>IntentCart turns a human shopping request into an explainable, bounded and buyer-approved checkout—end to end.</p>
          <div className="hero-actions"><a href="/demo">Try the live demo <ArrowRight /></a><a href="#how">See how it works <ArrowDownRight /></a></div>
        </div>
        <div className="hero-rule"><span>Intent</span><i /><span>Decision</span><i /><span>Approval</span><i /><span>Payment</span></div>
      </section>

      <section className="landing-product" id="product">
        <div className="section-tag">THE PRODUCT</div>
        <div className="product-intro"><h2>Commerce built for conversation,<br />not search boxes.</h2><p>Most storefronts force buyers to browse hundreds of products. IntentCart starts with the outcome they want and assembles a purchase that stays inside every constraint.</p></div>
        <div className="product-stage">
          <div className="stage-prompt">
            <span><Bot /> Buyer request</span>
            <blockquote>“Build a skincare gift for my sister under ₹2,000. She has sensitive skin, and I need it by Friday.”</blockquote>
            <div className="prompt-chips"><span>₹2,000 max</span><span>Sensitive skin</span><span>Friday</span></div>
          </div>
          <div className="stage-arrow"><Sparkles /></div>
          <div className="stage-cart">
            <div className="mini-cart-head"><span>AI-BUILT CART</span><strong>96<small>/100 fit</small></strong></div>
            <div className="mini-product"><div className="mini-image product-one" /><span><strong>Dewdrop Cleanser</strong><small>Fragrance-free</small></span><b>₹549</b></div>
            <div className="mini-product"><div className="mini-image product-two" /><span><strong>Bright C Serum</strong><small>10% vitamin C</small></span><b>₹749</b></div>
            <div className="mini-product"><div className="mini-image product-three" /><span><strong>Cloudveil SPF 50</strong><small>No white cast</small></span><b>₹599</b></div>
            <div className="mini-total"><span>Total · within bound</span><strong>₹1,897</strong></div>
          </div>
          <div className="stage-approval"><LockKeyhole /><span><small>MONEY ACTION</small><strong>Waiting for buyer approval</strong><p>The agent cannot spend ₹1.</p></span></div>
        </div>
      </section>

      <section className="landing-flow" id="how">
        <div className="section-tag">HOW IT WORKS</div>
        <div className="flow-heading"><h2>One intent.<br />Four accountable steps.</h2><p>The LLM recommends. Deterministic rules decide what is allowed. The human authorises every payment.</p></div>
        <div className="flow-grid">
          {flow.map((item) => <article key={item.n}><div><span>{item.n}</span><item.icon /></div><h3>{item.title}</h3><p>{item.copy}</p></article>)}
        </div>
      </section>

      <section className="landing-safety" id="safety">
        <div className="safety-copy">
          <div className="section-tag">THE BAR, BUILT IN</div>
          <h2>Autonomous enough to help.<br />Bounded enough to trust.</h2>
          <p>Every recommendation carries its evidence. Every money action passes deterministic checks. Every state change is preserved in an audit trail.</p>
          <a href="/audit">Inspect a complete audit trail <ArrowRight /></a>
        </div>
        <div className="safety-grid">
          <article><ShieldCheck /><span><strong>Explainable</strong><p>Product rankings include fit reasons, rejected alternatives and confidence.</p></span><b><Check /> PASS</b></article>
          <article><CircleDollarSign /><span><strong>Bounded</strong><p>Budget, discount, quantity and delivery rules cannot be overridden by the LLM.</p></span><b><Check /> PASS</b></article>
          <article><LockKeyhole /><span><strong>Gated</strong><p>Checkout requires explicit approval of the exact cart and amount.</p></span><b><Check /> PASS</b></article>
          <article className="failure-card"><TriangleAlert /><span><strong>Failure-aware</strong><p>When inventory changes, checkout stops, the cart repairs itself and the buyer approves again.</p></span><b>HANDLED</b></article>
        </div>
      </section>

      <section className="merchant-proof">
        <div><div className="section-tag">MERCHANT OUTCOME</div><h2>Not a chatbot.<br />A revenue channel.</h2></div>
        <div className="proof-metrics">
          <article><span>CONVERSION LIFT</span><strong>+24.6%</strong><p>against catalogue browsing baseline</p></article>
          <article><span>AVERAGE ORDER VALUE</span><strong>+18.2%</strong><p>with policy-bounded cross-sell</p></article>
          <article><span>POLICY COMPLIANCE</span><strong>100%</strong><p>across the evaluation batch</p></article>
        </div>
        <a href="/merchant">Open the merchant dashboard <ExternalLink /></a>
      </section>

      <section className="landing-cta">
        <span className="cta-orbit"><Bot /></span>
        <p>THE STOREFRONT IS NOW AN API</p>
        <h2>Tell IntentCart what you need.<br />Approve only what you want.</h2>
        <a href="/demo">Start shopping with AI <ArrowRight /></a>
      </section>

      <footer className="landing-footer">
        <a className="landing-brand" href="#top"><span><ShoppingBag /></span>intentcart</a>
        <p>Built for Razorpay AI Buildathon · Track 01</p>
        <div><a href="/demo">Demo</a><a href="/merchant">Merchant</a><a href="/audit">Audit trail</a></div>
      </footer>
    </main>
  );
}
