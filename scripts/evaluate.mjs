import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const result = JSON.parse(await readFile(new URL("../evaluation/summary.json", import.meta.url), "utf8"));

assert.equal(result.sessions, 500);
assert.equal(result.intentcart.policy_violations_executed, 0);
assert.equal(result.intentcart.injected_failures, result.intentcart.failures_handled);
assert.equal(Number((((result.intentcart.converted / result.baseline.converted) - 1) * 100).toFixed(2)), result.lift.conversion_percent);
assert.equal(Number((((result.intentcart.average_order_value_inr / result.baseline.average_order_value_inr) - 1) * 100).toFixed(2)), result.lift.average_order_value_percent);

console.table({
  baseline: { converted: result.baseline.converted, conversion: `${result.baseline.conversion_rate * 100}%`, aov: `₹${result.baseline.average_order_value_inr}` },
  intentcart: { converted: result.intentcart.converted, conversion: `${result.intentcart.conversion_rate * 100}%`, aov: `₹${result.intentcart.average_order_value_inr}` },
});
console.log(`Conversion lift: ${result.lift.conversion_percent}%`);
console.log(`AOV lift: ${result.lift.average_order_value_percent}%`);
console.log(`Failures handled: ${result.intentcart.failures_handled}/${result.intentcart.injected_failures}`);
