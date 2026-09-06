"use client";

import { useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Eye,
  Gauge,
  PackageSearch,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const trend = [
  { day: "Mon", intent: 43, baseline: 32 }, { day: "Tue", intent: 58, baseline: 39 },
  { day: "Wed", intent: 71, baseline: 46 }, { day: "Thu", intent: 94, baseline: 61 },
  { day: "Fri", intent: 122, baseline: 81 }, { day: "Sat", intent: 146, baseline: 98 },
  { day: "Sun", intent: 173, baseline: 111 },
];

const sessions = [
  { id: "IC-2048", intent: "Sensitive-skin gift under ₹2,000", cart: "3 products", value: "₹1,897", result: "Converted", guardrail: "3/3 passed" },
  { id: "IC-2047", intent: "Haircare routine for dry curls", cart: "4 products", value: "₹2,416", result: "Reviewing", guardrail: "3/3 passed" },
  { id: "IC-2046", intent: "Wedding gift under ₹5,000", cart: "5 products", value: "₹4,820", result: "Converted", guardrail: "4/4 passed" },
  { id: "IC-2045", intent: "Add two premium serums", cart: "Blocked", value: "₹3,399", result: "Bound exceeded", guardrail: "2/3 passed" },
];

export default function MerchantPage() {
  const [period, setPeriod] = useState("Last 7 days");
  return (
    <main className="merchant-shell">
      <aside className="merchant-sidebar">
        <a className="merchant-logo" href="/"><span><ShoppingBag /></span>intentcart</a>
        <p>Merchant console</p>
        <nav><a className="selected"><Gauge />Overview</a><a><Bot />Agent sessions</a><a><PackageSearch />Catalogue</a><a><ShieldCheck />Policies</a><a><TriangleAlert />Exceptions <b>3</b></a></nav>
        <div className="merchant-side-card"><Sparkles /><strong>Agent catalogue health</strong><Progress value={94} /><span>94% ready for AI buyers</span></div>
        <a className="back-shop" href="/demo"><ArrowLeft />Open buyer demo</a>
      </aside>

      <section className="merchant-main">
        <header className="merchant-header"><div><p>Nova Beauty · Test mode</p><h1>Agentic commerce overview</h1></div><Button variant="outline" onClick={() => setPeriod(period === "Last 7 days" ? "Last 30 days" : "Last 7 days")}>{period}<ChevronDown /></Button></header>

        <section className="merchant-metrics">
          <article><span><CircleDollarSign />Agent-attributed revenue</span><strong>₹3,28,440</strong><p><b><ArrowUpRight />24.6%</b> vs. browsing baseline</p></article>
          <article><span><Users />Qualified intents</span><strong>1,284</strong><p><b><ArrowUpRight />18.9%</b> week over week</p></article>
          <article><span><TrendingUp />Average order value</span><strong>₹1,946</strong><p><b><ArrowUpRight />18.2%</b> with bounded cross-sell</p></article>
          <article><span><ShieldCheck />Policy compliance</span><strong>100%</strong><p>46 actions safely blocked</p></article>
        </section>

        <section className="merchant-grid">
          <article className="merchant-card performance-card">
            <div className="merchant-card-head"><div><h2>Revenue contribution</h2><p>Cumulative orders attributed to AI shopping sessions</p></div><Badge variant="outline">LIVE EVALUATION</Badge></div>
            <div className="merchant-legend"><span><i className="intent-line" />IntentCart ₹3.28L</span><span><i className="base-line" />Baseline ₹2.64L</span></div>
            <div className="merchant-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend} margin={{ top: 12, right: 10, left: -20, bottom: 0 }}><defs><linearGradient id="merchantFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6b4ee8" stopOpacity={.24}/><stop offset="1" stopColor="#6b4ee8" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#e9e5ee" vertical={false}/><XAxis dataKey="day" axisLine={false} tickLine={false} fontSize={12}/><YAxis axisLine={false} tickLine={false} fontSize={12}/><Tooltip/><Area type="monotone" dataKey="baseline" stroke="#b0aabb" fill="none" strokeDasharray="5 5"/><Area type="monotone" dataKey="intent" stroke="#6b4ee8" strokeWidth={2.5} fill="url(#merchantFill)"/></AreaChart></ResponsiveContainer></div>
          </article>
          <article className="merchant-card funnel-card"><div className="merchant-card-head"><div><h2>Intent funnel</h2><p>Last 1,284 shopping sessions</p></div></div><div className="funnel-list"><div><span>Intent understood</span><strong>1,213 <small>94.5%</small></strong><Progress value={94.5}/></div><div><span>Valid cart composed</span><strong>942 <small>73.4%</small></strong><Progress value={73.4}/></div><div><span>Buyer approved</span><strong>618 <small>48.1%</small></strong><Progress value={48.1}/></div><div><span>Payment captured</span><strong>514 <small>40.0%</small></strong><Progress value={40}/></div></div><div className="funnel-note"><ArrowUpRight /><span><strong>+9.8 point conversion lift</strong>against catalogue browsing</span></div></article>
        </section>

        <section className="merchant-card sessions-card">
          <div className="merchant-card-head"><div><h2>Recent agent sessions</h2><p>Every recommendation, policy decision and money action</p></div><Button variant="outline"><Eye />View all sessions</Button></div>
          <Table><TableHeader><TableRow><TableHead>Session</TableHead><TableHead>Buyer intent</TableHead><TableHead>Cart</TableHead><TableHead>Value</TableHead><TableHead>Guardrails</TableHead><TableHead>Outcome</TableHead></TableRow></TableHeader><TableBody>{sessions.map((session)=><TableRow key={session.id}><TableCell className="session-id">{session.id}</TableCell><TableCell>{session.intent}</TableCell><TableCell>{session.cart}</TableCell><TableCell><strong>{session.value}</strong></TableCell><TableCell><span className="guardrail-cell"><ShieldCheck />{session.guardrail}</span></TableCell><TableCell><Badge variant="outline" className={session.result === "Converted" ? "result-success" : session.result === "Bound exceeded" ? "result-blocked" : "result-waiting"}>{session.result === "Converted" && <CheckCircle2 />}{session.result}</Badge></TableCell></TableRow>)}</TableBody></Table>
        </section>
      </section>
    </main>
  );
}
