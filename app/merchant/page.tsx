"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowUpRight, Bot, CheckCircle2, CircleDollarSign, Gauge, PackageSearch, ShieldCheck, ShoppingBag, Sparkles, TrendingUp, TriangleAlert, Users } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Session = { id: string; intent: string; title: string; status: "ready" | "blocked" | "approved" | "ordered"; total: number; cart: Array<{ productId: string; quantity: number }>; policy: { passed: boolean }; createdAt: string };
type Snapshot = { sessions: number; converted: number; blocked: number; revenue: number; aov: number; recent: Session[] };
const money = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;

export default function MerchantPage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { fetch("/api/merchant").then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error); return result; }).then(setData).catch((cause) => setError(cause instanceof Error ? cause.message : "Analytics could not be loaded.")); }, []);
  const conversion = data?.sessions ? (data.converted / data.sessions) * 100 : 0;
  const compliance = data?.sessions ? ((data.sessions - data.blocked) / data.sessions) * 100 : 100;
  const trend = useMemo(() => {
    let orders = 0;
    return [...(data?.recent ?? [])].reverse().map((session, index) => { if (session.status === "ordered") orders += session.total / 100; return { step: index + 1, revenue: orders, carts: (index + 1) * 500 }; });
  }, [data]);

  return (
    <main className="merchant-shell">
      <aside className="merchant-sidebar"><a className="merchant-logo" href="/"><span><ShoppingBag /></span>intentcart</a><p>Merchant console</p><nav><a className="selected"><Gauge />Overview</a><a><Bot />Agent sessions</a><a><PackageSearch />Catalogue</a><a><ShieldCheck />Policies</a><a><TriangleAlert />Exceptions <b>{data?.blocked ?? 0}</b></a></nav><div className="merchant-side-card"><Sparkles /><strong>Catalogue readiness</strong><Progress value={100} /><span>5 products policy-ready</span></div><a className="back-shop" href="/demo"><ArrowLeft />Open buyer demo</a></aside>
      <section className="merchant-main">
        <header className="merchant-header"><div><p>Nova Beauty · persisted activity</p><h1>Commerce operations overview</h1></div><Button variant="outline" onClick={() => window.location.reload()}>Refresh data</Button></header>
        {error && <div className="merchant-error"><TriangleAlert />{error}</div>}
        <section className="merchant-metrics"><article><span><CircleDollarSign />Agent-attributed revenue</span><strong>{money(data?.revenue ?? 0)}</strong><p><b><ArrowUpRight />{data?.converted ?? 0}</b> completed test orders</p></article><article><span><Users />Shopping sessions</span><strong>{data?.sessions ?? 0}</strong><p><b>{conversion.toFixed(1)}%</b> checkout conversion</p></article><article><span><TrendingUp />Average order value</span><strong>{money(data?.aov ?? 0)}</strong><p>Calculated from completed sessions</p></article><article><span><ShieldCheck />Policy compliance</span><strong>{compliance.toFixed(1)}%</strong><p>{data?.blocked ?? 0} currently blocked sessions</p></article></section>
        <section className="merchant-grid"><article className="merchant-card performance-card"><div className="merchant-card-head"><div><h2>Recorded revenue</h2><p>Cumulative order value from persisted shopping sessions</p></div><Badge variant="outline">LIVE SESSION DATA</Badge></div>{trend.length ? <><div className="merchant-legend"><span><i className="intent-line" />Completed orders</span></div><div className="merchant-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend} margin={{ top: 12, right: 10, left: -10, bottom: 0 }}><defs><linearGradient id="merchantFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6b4ee8" stopOpacity={.24}/><stop offset="1" stopColor="#6b4ee8" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#e9e5ee" vertical={false}/><XAxis dataKey="step" axisLine={false} tickLine={false} fontSize={12}/><YAxis axisLine={false} tickLine={false} fontSize={12}/><Tooltip formatter={(value) => `₹${Number(value).toLocaleString("en-IN")}`} /><Area type="monotone" dataKey="revenue" stroke="#6b4ee8" strokeWidth={2.5} fill="url(#merchantFill)"/></AreaChart></ResponsiveContainer></div></> : <div className="chart-empty"><TrendingUp /><strong>No orders recorded yet</strong><p>Complete the buyer flow and this chart will update from the saved session.</p></div>}</article>
          <article className="merchant-card funnel-card"><div className="merchant-card-head"><div><h2>Session funnel</h2><p>Built from all recorded sessions</p></div></div><div className="funnel-list"><div><span>Intent understood</span><strong>{data?.sessions ?? 0} <small>100%</small></strong><Progress value={data?.sessions ? 100 : 0}/></div><div><span>Valid cart composed</span><strong>{(data?.sessions ?? 0) - (data?.blocked ?? 0)} <small>{compliance.toFixed(1)}%</small></strong><Progress value={data?.sessions ? compliance : 0}/></div><div><span>Buyer approved</span><strong>{data?.converted ?? 0} <small>{conversion.toFixed(1)}%</small></strong><Progress value={conversion}/></div><div><span>Order created</span><strong>{data?.converted ?? 0} <small>{conversion.toFixed(1)}%</small></strong><Progress value={conversion}/></div></div><div className="funnel-note"><ArrowUpRight /><span><strong>One source of truth</strong>for sessions, policies and orders</span></div></article>
        </section>
        <section className="merchant-card sessions-card"><div className="merchant-card-head"><div><h2>Recent agent sessions</h2><p>Recommendations, current policy state and checkout outcomes</p></div><Button variant="outline" asChild><a href="/audit">Open latest trace</a></Button></div>{data?.recent.length ? <Table><TableHeader><TableRow><TableHead>Session</TableHead><TableHead>Buyer intent</TableHead><TableHead>Cart</TableHead><TableHead>Value</TableHead><TableHead>Guardrails</TableHead><TableHead>Outcome</TableHead></TableRow></TableHeader><TableBody>{data.recent.map((session) => <TableRow key={session.id}><TableCell className="session-id"><a href={`/audit?sessionId=${encodeURIComponent(session.id)}`}>{session.id}</a></TableCell><TableCell>{session.intent}</TableCell><TableCell>{session.cart.reduce((sum, item) => sum + item.quantity, 0)} items</TableCell><TableCell><strong>{money(session.total)}</strong></TableCell><TableCell><span className="guardrail-cell"><ShieldCheck />{session.policy.passed ? "Passed" : "Blocked"}</span></TableCell><TableCell><Badge variant="outline" className={session.status === "ordered" ? "result-success" : session.status === "blocked" ? "result-blocked" : "result-waiting"}>{session.status === "ordered" && <CheckCircle2 />}{session.status === "ordered" ? "Converted" : session.status === "blocked" ? "Blocked" : "Reviewing"}</Badge></TableCell></TableRow>)}</TableBody></Table> : <div className="sessions-empty"><Bot /><strong>No sessions yet</strong><p>Build a cart in the buyer demo to populate this dashboard.</p><a href="/demo">Start a session</a></div>}</section>
      </section>
    </main>
  );
}
