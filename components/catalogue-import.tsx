"use client";
import { useState } from "react";
import type { CatalogueProduct } from "@/lib/commerce";
import { parseCatalogueImport, mergeCatalogueImport } from "@/lib/catalogue-import";
export function CatalogueImport({ products, onApply, disabled }: { products: CatalogueProduct[]; onApply: (products: CatalogueProduct[]) => void; disabled: boolean }) {
  const [preview, setPreview] = useState<CatalogueProduct[] | null>(null); const [replace, setReplace] = useState(false); const [error, setError] = useState(""); const [reading, setReading] = useState(false);
  async function read(file?: File) {
    setPreview(null); setError(""); if (!file) return; setReading(true);
    try { if (file.size > 512000) throw new Error("Maximum file size is 500 KB."); const ext = file.name.split(".").pop()?.toLowerCase(); if (ext !== "csv" && ext !== "json") throw new Error("Choose a .csv or .json file."); setPreview(parseCatalogueImport(await file.text(), ext)); }
    catch (cause) { setError((cause as Error).message); } finally { setReading(false); }
  }
  function apply() {
    if (!preview) return;
    try { onApply(mergeCatalogueImport(products, preview, replace)); setPreview(null); setError(""); }
    catch (cause) { setError((cause as Error).message); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(products, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "intentcart-catalogue.json"; link.click(); URL.revokeObjectURL(url);
  }
  const ids = new Set(products.map(p => p.id)); const incoming = new Set(preview?.map(p => p.id));
  return <section className="account-card"><h2>Import catalogue</h2><p>CSV prices use rupees; JSON prices use integer paise. Tags in CSV use | separators. Imports enter your draft; click Save catalogue to persist them.</p><a href="/catalogue-template.csv" download>Download CSV template</a> · <button type="button" disabled={disabled} onClick={download}>Export current draft as JSON</button><p><input aria-label="Import catalogue file" type="file" accept=".csv,.json" disabled={disabled || reading} onChange={event => void read(event.target.files?.[0])}/></p>{error && <p role="alert">{error}</p>}{preview && <><label>Import behaviour<select value={replace ? "replace" : "merge"} onChange={event => setReplace(event.target.value === "replace")}><option value="merge">Merge by SKU — keep other products</option><option value="replace">Replace the whole draft catalogue</option></select></label><p>{preview.filter(p => !ids.has(p.id)).length} new · {preview.filter(p => ids.has(p.id)).length} matching SKUs · {replace ? products.filter(p => !incoming.has(p.id)).length : 0} removed</p><div style={{ maxHeight: 300, overflow: "auto" }}><table><thead><tr><th>SKU</th><th>Name</th><th>Category</th><th>Price</th><th>Available</th></tr></thead><tbody>{preview.map(p => <tr key={p.id}><td>{p.id}</td><td>{p.name}</td><td>{p.category}</td><td>₹{p.price / 100}</td><td>{p.stock}</td></tr>)}</tbody></table></div><button type="button" disabled={disabled} onClick={apply}>Apply preview to draft</button> <button type="button" onClick={() => setPreview(null)}>Discard import</button></>}</section>;
}
