import { createHash } from "node:crypto";
export function paymentProviderIdentity() {
  const endpoint = process.env.PAYMENT_ORDER_API_URL; const account = process.env.PAYMENT_KEY_ID;
  return endpoint && account ? createHash("sha256").update(JSON.stringify([endpoint, account])).digest("hex") : undefined;
}
