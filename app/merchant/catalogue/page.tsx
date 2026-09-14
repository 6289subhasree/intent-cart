"use client";
import { useEffect, useState, type FormEvent } from "react";
import { AccountMenu } from "@/components/merchant-account";
import type { CatalogueProduct } from "@/lib/commerce";
export default function CataloguePage() {
  const [data, setData] = useState<{ products: CatalogueProduct[]; version: string; storeName: string } | null>(null);
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  async function load() {
    try { const response = await fetch("/api/catalogue"); const result = await response.json() as NonNullable<typeof data> & { error?: string }; if (!response.ok) throw new Error(result.error); setData(result); } catch (cause) { setMessage((cause as Error).message); }
  }
  useEffect(() => { void load(); }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!data) return; const form = new FormData(event.currentTarget); setBusy(true); setMessage("");
    const products = data.products.map((product) => ({ ...product, name: String(form.get(`${product.id}-name`)), price: Math.round(Number(form.get(`${product.id}-price`)) * 100), stock: Number(form.get(`${product.id}-stock`)), deliveryDays: Number(form.get(`${product.id}-days`)) }));
    try {
      const response = await fetch("/api/catalogue", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ products, version: data.version }) });
      const result = await response.json() as NonNullable<typeof data> & { error?: string };
      if (!response.ok) throw new Error(result.error); setData(result); setMessage("Catalogue saved. New recommendations use these values; checkout rechecks existing carts.");
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }
  return <main className="catalogue-settings"><AccountMenu/><a href="/merchant">← Merchant overview</a><h1>{data?.storeName ?? "Your store"} catalogue</h1><p>These five sample products belong to your store. Available units exclude stock reserved by checkouts, including orders awaiting review.</p>{message && <p className="catalogue-message" role="status">{message}</p>}{data ? <form onSubmit={save} key={data.version}><div className="catalogue-editor">{data.products.map((product) => <fieldset key={product.id}><legend>{product.name}</legend><label>Product name<input name={`${product.id}-name`} defaultValue={product.name} required minLength={2} maxLength={100}/></label><label>Price (₹)<input name={`${product.id}-price`} type="number" min="0.01" max="1000000" step="0.01" defaultValue={product.price / 100} required/></label><label>Available units<input name={`${product.id}-stock`} type="number" min="0" max="100000" step="1" defaultValue={product.stock} required/></label><label>Estimated delivery (days)<input name={`${product.id}-days`} type="number" min="0" max="30" step="1" defaultValue={product.deliveryDays} required/></label><p>{product.detail}</p></fieldset>)}</div><button disabled={busy}>{busy ? "Saving…" : "Save catalogue"}</button> <button type="button" disabled={busy} onClick={() => void load()}>Reload saved values</button></form> : <p role="status">Loading catalogue…</p>}</main>;
}
