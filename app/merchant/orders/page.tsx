"use client";
import { useEffect, useState } from "react";
import { AccountMenu } from "@/components/merchant-account";
type Order = { id: string; title: string; total: number; status: string; createdAt: string; orderId: string | null; attempt?: { state: string } };
type Detail = { session: { id: string; total: number; cart: { productId: string; quantity: number }[] }; events: { id: string; title: string; detail: string }[] };
export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]); const [offset, setOffset] = useState(0); const [more, setMore] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true); setError("");
    try { const response = await fetch(`/api/orders?offset=${offset}`); const data = await response.json() as { orders: Order[]; hasMore: boolean; error?: string }; if (!response.ok) throw new Error(data.error); setOrders(data.orders); setMore(data.hasMore); }
    catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, [offset]);
  async function open(id: string) {
    setDetail(null); setError("");
    try { const response = await fetch(`/api/orders?sessionId=${encodeURIComponent(id)}`); const data = await response.json() as Detail & { error?: string }; if (!response.ok) throw new Error(data.error); setDetail(data); }
    catch (cause) { setError((cause as Error).message); }
  }
  return <main className="catalogue-settings"><AccountMenu/><a href="/merchant">← Merchant overview</a><h1>Orders & checkout review</h1><p>Order creation is separate from payment confirmation. Unconfirmed checkouts keep their stock reserved.</p><button disabled={busy} onClick={() => void load()}>Refresh orders</button>{error && <p role="alert">{error}</p>}{!busy && !orders.length && <p>No checkouts yet. Approved shopping carts appear here.</p>}<div className="catalogue-editor">{orders.map(order => <section className="account-card" key={order.id}><h2>{order.title}</h2><p>{order.status === "ordered" ? "Order created" : order.status === "cancelled" ? "Cancelled · stock released" : order.attempt?.state === "unknown" ? "Needs review · stock reserved" : "Pending · stock reserved"}</p><strong>₹{(order.total / 100).toLocaleString("en-IN")}</strong><p>{order.id}</p><p>{order.orderId ?? "No confirmed provider order"}</p><button onClick={() => void open(order.id)}>View details</button></section>)}</div><p><button disabled={offset === 0 || busy} onClick={() => setOffset(offset - 50)}>Previous</button> <button disabled={!more || busy} onClick={() => setOffset(offset + 50)}>Next</button></p>{detail && <section className="account-card"><h2>Checkout details</h2><p>{detail.session.id}</p><ul>{detail.session.cart.map(item => <li key={item.productId}>{item.productId} × {item.quantity}</li>)}</ul><p>Approved amount: ₹{(detail.session.total / 100).toLocaleString("en-IN")}</p><a href={`/audit?sessionId=${encodeURIComponent(detail.session.id)}`}>Open full audit trail</a>{detail.events.map(event => <div key={event.id}><h3>{event.title}</h3><p>{event.detail}</p></div>)}</section>}</main>;
}
