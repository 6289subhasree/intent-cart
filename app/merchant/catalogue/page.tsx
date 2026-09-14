"use client";
import { useEffect, useState, type FormEvent } from "react";
import { CatalogueImport } from "@/components/catalogue-import";
import { AccountMenu } from "@/components/merchant-account";
import type { CatalogueProduct } from "@/lib/commerce";
type Catalogue = { products: CatalogueProduct[]; version: string; storeName: string };
export default function CataloguePage() {
  const [data, setData] = useState<Catalogue | null>(null);
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    try { const response = await fetch("/api/catalogue"); const result = await response.json() as Catalogue & { error?: string }; if (!response.ok) throw new Error(result.error); setData(result); }
    catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  function edit(index: number, field: keyof CatalogueProduct, value: string | number | string[]) {
    setData(current => current ? { ...current, products: current.products.map((product, i) => i === index ? { ...product, [field]: value } : product) } : current);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!data) return; setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/catalogue", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ products: data.products.map(p => ({ ...p, tags: p.tags.map(tag => tag.trim()).filter(Boolean) })), version: data.version }) });
      const result = await response.json() as Catalogue & { error?: string };
      if (!response.ok) throw new Error(result.error);
      setData(result); setMessage("Catalogue saved. Recommendations and checkout now use these values.");
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }
  return <main className="catalogue-settings"><AccountMenu/><a href="/merchant">← Merchant overview</a><h1>{data?.storeName ?? "Your store"} catalogue</h1><p>Add up to 200 products. Categories are the words shoppers use to request products, such as “sunscreen” or “headphones”. Available units exclude reserved stock.</p>{message && <p className="catalogue-message" role="status">{message}</p>}{data && <CatalogueImport products={data.products} disabled={busy} onApply={products => { setData({ ...data, products }); setMessage("Import applied to draft. Review it and click Save catalogue."); }}/>} {data ? <form onSubmit={save}><div className="catalogue-editor">{data.products.map((product, index) => <fieldset key={product.id} disabled={busy}><legend>{product.name || "New product"}</legend><p>SKU: {product.id}</p><label>Product name<input value={product.name} onChange={e => edit(index, "name", e.target.value)} required minLength={2} maxLength={100}/></label><label>Description<input value={product.detail} onChange={e => edit(index, "detail", e.target.value)} required maxLength={180}/></label><label>Category<input value={product.category ?? ""} onChange={e => edit(index, "category", e.target.value)} required pattern="[a-z][a-z0-9 -]{1,39}" placeholder="headphones"/></label><label>Price (₹)<input type="number" min="0.01" max="1000000" step="0.01" value={product.price / 100} onChange={e => edit(index, "price", Math.round(Number(e.target.value) * 100))} required/></label><label>Available units<input type="number" min="0" max="100000" step="1" value={product.stock} onChange={e => edit(index, "stock", Number(e.target.value))} required/></label><label>Estimated delivery (days)<input type="number" min="0" max="30" step="1" value={product.deliveryDays} onChange={e => edit(index, "deliveryDays", Number(e.target.value))} required/></label><label>Tags (comma separated)<input value={product.tags.join(",")} onChange={e => edit(index, "tags", e.target.value.split(","))}/></label><label>Product image URL (HTTPS, optional)<input type="url" value={product.imageUrl ?? ""} onChange={e => edit(index, "imageUrl", e.target.value)} placeholder="https://…"/></label><button type="button" onClick={() => setData({ ...data, products: data.products.filter((_, i) => i !== index) })}>Remove from draft</button></fieldset>)}</div><p><button type="button" disabled={busy || data.products.length >= 200} onClick={() => setData({ ...data, products: [...data.products, { id: "sku_" + crypto.randomUUID(), name: "", detail: "", category: "", price: 10000, stock: 0, deliveryDays: 2, tags: [], crop: "product-one" }] })}>Add product</button></p><button disabled={busy}>{busy ? "Saving…" : "Save catalogue"}</button> <button type="button" disabled={busy} onClick={() => { if (window.confirm("Discard unsaved changes and reload the saved catalogue?")) void load(); }}>Reload saved values</button></form> : <p role="status">Loading catalogue…</p>}</main>;
}
