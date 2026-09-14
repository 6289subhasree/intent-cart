import { database, type StoredSession } from "@/db/repository";
import type { CatalogueProduct } from "@/lib/commerce";
import { AccessError } from "@/lib/auth";

export async function releaseReservation(session: StoredSession, evidence: string) {
  const db = await database();
  const reservation = await db.prepare("SELECT id FROM audit_events WHERE session_id = ? AND type = 'INVENTORY' AND title = 'Stock reserved for checkout' AND json_extract(metadata_json, '$.attemptId') = ?").bind(session.id, session.policy.checkoutAttempt?.id).first();
  if (!reservation) throw new AccessError("This legacy checkout has no recorded stock reservation. Manual inventory review is required.", 409);
  const store = await db.prepare("SELECT catalogue_json, catalogue_version FROM stores WHERE id = ?").bind(session.storeId).first();
  if (!store) throw new AccessError("Store unavailable.", 409);
  const products = JSON.parse(String(store.catalogue_json)) as CatalogueProduct[];
  for (const line of session.cart) {
    const product = products.find(p => p.id === line.productId);
    if (!product || product.stock + line.quantity > 100000) throw new AccessError("Catalogue needs review before stock can be restored.", 409);
    product.stock += line.quantity;
  }
  const resolutionId = crypto.randomUUID(); const now = new Date().toISOString();
  const policy = { ...session.policy, checkoutAttempt: { ...session.policy.checkoutAttempt!, state: "released", resolutionId } };
  const result = await db.batch([
    db.prepare("UPDATE shopping_sessions SET status = 'cancelled', policy_json = ?, updated_at = ? WHERE id = ? AND store_id = ? AND status = 'approved' AND json_extract(policy_json, '$.checkoutAttempt.id') = ? AND EXISTS (SELECT 1 FROM stores WHERE id = ? AND catalogue_version = ?)").bind(JSON.stringify(policy), now, session.id, session.storeId, session.policy.checkoutAttempt!.id, session.storeId, store.catalogue_version),
    db.prepare("UPDATE stores SET catalogue_json = ?, catalogue_version = ? WHERE id = ? AND EXISTS (SELECT 1 FROM shopping_sessions WHERE id = ? AND json_extract(policy_json, '$.checkoutAttempt.resolutionId') = ?)").bind(JSON.stringify(products), crypto.randomUUID(), session.storeId, session.id, resolutionId),
    db.prepare("INSERT INTO audit_events (id, session_id, sequence, type, state, title, detail, metadata_json, created_at) SELECT ?, ?, (SELECT COALESCE(MAX(sequence), 0) + 1 FROM audit_events WHERE session_id = ?), 'INVENTORY', 'repair', 'Reservation released', ?, ?, ? WHERE EXISTS (SELECT 1 FROM shopping_sessions WHERE id = ? AND json_extract(policy_json, '$.checkoutAttempt.resolutionId') = ?)").bind(crypto.randomUUID(), session.id, session.id, "Confirmed terminal outcome; available stock restored once.", JSON.stringify({ evidence, resolutionId }), now, session.id, resolutionId),
  ]);
  if (Number((result[0] as { meta: { changes: number } }).meta.changes) !== 1) throw new AccessError("Checkout or catalogue changed. Refresh before retrying.", 409);
}
