import {
  ArrowLeft,
  Bot,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Code2,
  FileJson,
  Fingerprint,
  LockKeyhole,
  PackageSearch,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  TriangleAlert,
  UserCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";

const events = [
  { time: "12:04:08.122", icon: Bot, state: "complete", type: "AGENT", title: "Buyer intent parsed", copy: "Budget ₹2,000 · sensitive skin · gift · delivery before Friday", meta: "confidence 0.98 · model response validated against schema" },
  { time: "12:04:08.407", icon: PackageSearch, state: "complete", type: "CATALOGUE", title: "42 eligible products evaluated", copy: "Excluded 11 fragrance products, 4 unavailable items and 3 products outside the delivery window.", meta: "catalogue snapshot cat_9f2d · 24 candidates retained" },
  { time: "12:04:09.031", icon: Sparkles, state: "complete", type: "AGENT", title: "Cart recommendation created", copy: "Selected cleanser, vitamin C serum and SPF. Fit score 0.96; subtotal ₹1,897.", meta: "recommendation rec_2048 · explanation attached" },
  { time: "12:04:09.044", icon: ShieldCheck, state: "complete", type: "POLICY", title: "Pre-checkout bounds passed", copy: "Budget, quantity, merchant allowlist, delivery promise and prohibited-action checks passed.", meta: "policy v1.3 · 5/5 checks passed" },
  { time: "12:04:16.820", icon: TriangleAlert, state: "failure", type: "INVENTORY", title: "Inventory conflict detected", copy: "Bright C Serum became unavailable after recommendation. Checkout was blocked before order creation.", meta: "failure INV-409 · no money action attempted" },
  { time: "12:04:17.294", icon: RefreshCw, state: "repair", type: "RECOVERY", title: "Cart repaired and revalidated", copy: "Substituted Calm Barrier Serum at the same ₹749 price and preserved Thursday delivery.", meta: "new recommendation rec_2048_r1 · buyer approval invalidated" },
  { time: "12:04:17.310", icon: LockKeyhole, state: "waiting", type: "GATE", title: "Explicit approval requested again", copy: "Because the cart changed, the prior approval could not be reused. Exact amount: ₹1,897.", meta: "approval gate ag_84cd · waiting for buyer" },
  { time: "12:04:24.015", icon: UserCheck, state: "complete", type: "BUYER", title: "Buyer approved exact cart and amount", copy: "Approval captured for recommendation rec_2048_r1. Scope is limited to one order.", meta: "approval apr_81de · expires in 10 minutes" },
  { time: "12:04:24.661", icon: CircleDollarSign, state: "complete", type: "MONEY", title: "Test order created", copy: "₹1,897 order created only after approval. Test payment completed successfully.", meta: "order order_IC2048 · test mode · idempotency key retained" },
];

export default function AuditPage() {
  return (
    <main className="audit-shell">
      <header className="audit-nav"><a className="audit-logo" href="/"><span><ShoppingBag /></span>intentcart</a><div><Badge variant="outline">IMMUTABLE DEMO LOG</Badge><a href="/demo"><ArrowLeft />Back to buyer demo</a></div></header>
      <section className="audit-title"><div><p>TRACE · IC-2048</p><h1>One checkout.<br /><em>Every decision visible.</em></h1></div><div className="audit-summary"><article><span>FINAL AMOUNT</span><strong>₹1,897</strong></article><article><span>POLICY RESULT</span><strong className="passed"><Check />Passed</strong></article><article><span>FAILURES</span><strong className="handled">1 handled</strong></article><article><span>MONEY ACTIONS</span><strong>1 approved</strong></article></div></section>

      <section className="audit-content">
        <div className="timeline">
          {events.map((event, index) => <article className={`timeline-event ${event.state}`} key={event.time}><time>{event.time}</time><span className="timeline-icon"><event.icon /></span><div className="timeline-copy"><div><Badge variant="outline">{event.type}</Badge><span>EVENT {String(index + 1).padStart(2,"0")}</span></div><h2>{event.title}</h2><p>{event.copy}</p><code>{event.meta}</code></div></article>)}
        </div>
        <aside className="audit-inspector">
          <div className="inspector-head"><Fingerprint /><div><span>TRACE INTEGRITY</span><strong>Verified</strong></div><CheckCircle2 /></div>
          <div className="inspector-block"><h2>Execution boundary</h2><dl><div><dt>Agent role</dt><dd>Recommend only</dd></div><div><dt>Executor</dt><dd>Policy-controlled</dd></div><div><dt>Approval</dt><dd>Human · exact amount</dd></div><div><dt>Environment</dt><dd>Safe test mode</dd></div></dl></div>
          <div className="inspector-block"><h2>Failure proof</h2><div className="failure-proof"><TriangleAlert /><span><strong>Checkout stopped</strong><p>The unavailable item produced zero financial side effects.</p></span></div><div className="repair-proof"><RefreshCw /><span><strong>Approval reset</strong><p>The repaired cart could not inherit stale buyer consent.</p></span></div></div>
          <div className="inspector-block"><h2>Structured evidence</h2><pre>{`{
  "trace_id": "IC-2048",
  "policy_version": "1.3",
  "approved_amount": 189700,
  "currency": "INR",
  "failure_handled": true,
  "payment_mode": "test"
}`}</pre></div>
          <a className="download-trace" href="data:application/json,%7B%22trace_id%22%3A%22IC-2048%22%2C%22failure_handled%22%3Atrue%7D" download="intentcart-trace-IC-2048.json"><FileJson />Download JSON trace</a>
        </aside>
      </section>
      <footer className="audit-footer"><span><Code2 />Deterministic policy engine · trace schema v1</span><span><Clock3 />Recorded 6 September 2026</span></footer>
    </main>
  );
}
