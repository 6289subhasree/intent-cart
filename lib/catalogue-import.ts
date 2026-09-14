import { productsSchema } from "./catalogue-schema";
import type { CatalogueProduct } from "./commerce";

function csvRows(text: string) {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false; let closed = false;
  const finishCell = () => { row.push(cell); cell = ""; closed = false; };
  const finishRow = () => { finishCell(); if (row.some(value => value.trim())) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } }
      else cell += char;
    } else if (char === ',') finishCell();
    else if (char === '\n' || char === '\r') { if (char === '\r' && text[i + 1] === '\n') i++; finishRow(); }
    else if (char === '"' && cell === "" && !closed) quoted = true;
    else { if (closed || char === '"') throw new Error("Malformed CSV quoting."); cell += char; }
  }
  if (quoted) throw new Error("CSV has an unclosed quote.");
  if (cell || row.length || closed) finishRow();
  return rows;
}

export function parseCatalogueImport(text: string, format: "json" | "csv") {
  if (new TextEncoder().encode(text).length > 512000) throw new Error("Import is larger than 500 KB.");
  const clean = text.replace(/^\uFEFF/, ""); let value: unknown;
  if (format === "json") value = JSON.parse(clean);
  else {
    const [header, ...rows] = csvRows(clean);
    const required = ["id", "name", "detail", "category", "priceRupees", "stock", "deliveryDays"];
    const allowed = [...required, "tags", "imageUrl", "crop"];
    if (!header || new Set(header).size !== header.length || header.some(key => !allowed.includes(key)) || required.some(key => !header.includes(key))) throw new Error("CSV headers must include id,name,detail,category,priceRupees,stock,deliveryDays. Optional: tags,imageUrl,crop.");
    value = rows.map((row, index) => {
      if (row.length !== header.length) throw new Error(`CSV row ${index + 2} has the wrong number of columns.`);
      const fields = Object.fromEntries(header.map((key, i) => [key, row[i].trim()]));
      if (!/^\d+(\.\d{1,2})?$/.test(fields.priceRupees) || !/^\d+$/.test(fields.stock) || !/^\d+$/.test(fields.deliveryDays)) throw new Error(`CSV row ${index + 2}: use a rupee price with at most two decimals and whole-number stock/delivery.`);
      const { priceRupees, ...rest } = fields;
      return { ...rest, price: Math.round(Number(priceRupees) * 100), stock: Number(fields.stock), deliveryDays: Number(fields.deliveryDays), tags: fields.tags ? fields.tags.split("|").map(tag => tag.trim()) : [], crop: fields.crop || "product-one" };
    });
  }
  const parsed = productsSchema.safeParse(value);
  if (!parsed.success) throw new Error(parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; "));
  if (!parsed.data.length) throw new Error("Import needs at least one product. Remove products in the editor to empty a catalogue.");
  return parsed.data;
}

export function mergeCatalogueImport(current: CatalogueProduct[], imported: CatalogueProduct[], replace: boolean) {
  const merged = replace ? imported : [...new Map([...current, ...imported].map(product => [product.id, product])).values()];
  const parsed = productsSchema.safeParse(merged);
  if (!parsed.success) throw new Error("Combined catalogue exceeds 200 products or contains invalid product data.");
  return parsed.data;
}
