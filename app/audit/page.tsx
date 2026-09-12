"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Bot, Check, CheckCircle2, CircleDollarSign, Clock3, Code2, FileJson, Fingerprint, LockKeyhole,
  PackageSearch, RefreshCw, ShieldCheck, ShoppingBag, Sparkles, TriangleAlert, UserCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";

type Session = { id: string; intent: string; title: string; status: string; total: number; budget: number; currency: string; cartVersion: string; policy: { passed: boolean }; approvedAt: string | null; orderId: string | null; mode: string };
type Event = { id: string; sequence: number; type: string; state: "complete" | "failure" | "repair" | "waiting"; title: string; detail: string; metadata: Record<string, unknown>; createdAt: string };
type Bundle = { session: Session; events: Event[] };

const icons = { AGENT: Bot, CATALOGUE: PackageSearch, POLICY: ShieldCheck, INVENTORY: TriangleAlert, RECOVERY: RefreshCw, GATE: LockKeyhole, BUYER: UserCheck, MONEY: CircleDollarSign };
const money = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;

export default function AuditPage() {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get("sessionId");
    fetch(`/api/audit${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`)
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error); return result; })
      .then(setBundle).catch((cause) => setError(cause instanceof Error ? cause.message : "The audit trail could not be loaded."));
  }, []);

  const download = useMemo(() => bundle ? `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(bundle, null, 2))}` : "#", [bundle]);
  const failures = bundle?.events.filter((event) => event.state === "failure").length ?? 0;
  const moneyActions = bundle?.events.filter((event) => event.type === "MONEY").length ?? 0;

  return (
    <main className="audit-shell">
      <header className="audit-nav"><a className="audit-logo" href="/"><span><ShoppingBag /></span>intentcart</a><div><Badge variant="outline">PERSISTED EVENT LOG</Badge><a href="/demo"><ArrowLeft />Back to buyer demo</a></div></header>
      {!bundle ? <section className="audit-empty"><Fingerprint /><h1>{error ? "No trace to inspect yet" : "Loading the latest trace…"}</h1><p>{error ?? "Reading the saved recommendation, policy and order events."}</p>{error && <a href="/demo">Start a shopping session <ArrowLeft /></a>}</section> : <>
        <section className="audit-title"><div><p>TRACE · {bundle.session.id}</p><h1>One checkout.<br /><em>Every decision visible.</em></h1></div><div className="audit-summary"><article><span>CURRENT AMOUNT</span><strong>{money(bundle.session.total)}</strong></article><article><span>POLICY RESULT</span><strong className={bundle.session.policy.passed ? "passed" : "handled"}>{bundle.session.policy.passed && <Check />} {bundle.session.policy.passed ? "Passed" : "Blocked"}</strong></article><article><span>FAILURES</span><strong className="handled">{failures} handled</strong></article><article><span>MONEY ACTIONS</span><strong>{moneyActions} approved</strong></article></div></section>
        <section className="audit-content">
          <div className="timeline">{bundle.events.map((event) => { const Icon = icons[event.type as keyof typeof icons] ?? Sparkles; return <article className={`timeline-event ${event.state}`} key={event.id}><time>{new Date(event.createdAt).toLocaleTimeString("en-GB", { hour12: false })}</time><span className="timeline-icon"><Icon /></span><div className="timeline-copy"><div><Badge variant="outline">{event.type}</Badge><span>EVENT {String(event.sequence).padStart(2, "0")}</span></div><h2>{event.title}</h2><p>{event.detail}</p><code>{Object.entries(event.metadata).map(([key, value]) => `${key}=${typeof value === "object" ? JSON.stringify(value) : value}`).join(" · ") || "recorded"}</code></div></article>; })}</div>
          <aside className="audit-inspector">
            <div className="inspector-head"><Fingerprint /><div><span>TRACE INTEGRITY</span><strong>Stored</strong></div><CheckCircle2 /></div>
            <div className="inspector-block"><h2>Execution boundary</h2><dl><div><dt>Agent role</dt><dd>Recommend only</dd></div><div><dt>Executor</dt><dd>Policy-controlled</dd></div><div><dt>Approval</dt><dd>{bundle.session.approvedAt ? "Exact amount" : "Waiting"}</dd></div><div><dt>Cart version</dt><dd>{bundle.session.cartVersion.split("-").slice(-1)[0]}</dd></div></dl></div>
            <div className="inspector-block"><h2>Failure proof</h2><div className="failure-proof"><TriangleAlert /><span><strong>{failures ? "Checkout stopped" : "No failure triggered"}</strong><p>{failures ? "The inventory conflict produced zero financial side effects." : "Trigger the inventory case in the buyer demo to add a failure event."}</p></span></div><div className="repair-proof"><RefreshCw /><span><strong>Approval follows cart version</strong><p>A changed cart cannot inherit consent from an older version.</p></span></div></div>
            <div className="inspector-block"><h2>Structured evidence</h2><pre>{JSON.stringify({ trace_id: bundle.session.id, cart_version: bundle.session.cartVersion, approved_amount: bundle.session.approvedAt ? bundle.session.total : null, currency: bundle.session.currency, order_id: bundle.session.orderId, status: bundle.session.status }, null, 2)}</pre></div>
            <a className="download-trace" href={download} download={`intentcart-trace-${bundle.session.id}.json`}><FileJson />Download JSON trace</a>
          </aside>
        </section>
        <footer className="audit-footer"><span><Code2 />Server policy · persisted trace schema v2</span><span><Clock3 />Updated {new Date(bundle.events.at(-1)?.createdAt ?? Date.now()).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span></footer>
      </>}
    </main>
  );
}
