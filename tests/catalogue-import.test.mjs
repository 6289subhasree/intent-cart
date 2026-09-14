import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

test("catalogue import validates CSV/JSON, preserves quoted fields and previews merge or replacement", async () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const vite = await createServer({ configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true, hmr: false } });
  try {
    const { parseCatalogueImport: parse, mergeCatalogueImport: merge } = await vite.ssrLoadModule("/lib/catalogue-import.ts");
    const template = readFileSync(new URL("../public/catalogue-template.csv", import.meta.url), "utf8");
    const products = parse(template, "csv"); assert.equal(products[0].price, 129900); assert.deepEqual(products[0].tags, ["wired", "over-ear"]);
    assert.deepEqual(parse(JSON.stringify(products), "json"), products);
    const quoted = template.replace("Studio Headphones", '"Studio, ""Pro"" Headphones"').replace("Over-ear wired headphones", '"Line one\nLine two"');
    assert.equal(parse(quoted, "csv")[0].name, 'Studio, "Pro" Headphones');
    assert.equal(parse(quoted, "csv")[0].detail, "Line one\nLine two");
    assert.throws(() => parse(template.replace("1299.00", "12.999"), "csv"));
    assert.throws(() => parse(template.replace("Studio Headphones", '"Unclosed'), "csv"));
    assert.throws(() => parse(JSON.stringify([products[0], products[0]]), "json"));
    assert.throws(() => parse(JSON.stringify([{ ...products[0], stock: -1 }]), "json"));
    assert.throws(() => parse("x".repeat(512001), "csv"));
    assert.throws(() => parse("[]", "json"));
    const changed = [{ ...products[0], stock: 7 }];
    assert.equal(merge(products, changed, false).length, 2); assert.equal(merge(products, changed, false)[0].stock, 7);
    assert.equal(products[0].stock, 10, "preview never mutates input"); assert.equal(merge(products, changed, true).length, 1);
    const large = Array.from({ length: 200 }, (_, i) => ({ ...products[0], id: "sku" + i }));
    assert.throws(() => merge(large, [{ ...products[0], id: "extra" }], false));
  } finally { await vite.close(); }
});
