import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/db/repository";
import { AccessError, hashPassword, issueSession, rateLimit, readJson, verifyPassword, withMerchant } from "@/lib/auth";
const schema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(12).max(128) }).strict();
export const POST = withMerchant(async (request, merchant) => {
  await rateLimit(`password:${merchant.merchantId}`, 5);
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) throw new AccessError("Enter your current password and a new password of 12–128 characters.", 400);
  const db = await database();
  const row = await db.prepare("SELECT password_hash FROM merchants WHERE id = ?").bind(merchant.merchantId).first();
  if (!row || !await verifyPassword(parsed.data.currentPassword, String(row.password_hash))) throw new AccessError("Current password is incorrect.", 403);
  const passwordHash = await hashPassword(parsed.data.newPassword);
  const changed = await db.batch([
    db.prepare("UPDATE merchants SET password_hash = ? WHERE id = ? AND password_hash = ?").bind(passwordHash, merchant.merchantId, row.password_hash),
    db.prepare("DELETE FROM auth_sessions WHERE merchant_id = ? AND EXISTS (SELECT 1 FROM merchants WHERE id = ? AND password_hash = ?)").bind(merchant.merchantId, merchant.merchantId, passwordHash),
  ]);
  if (Number((changed[0] as { meta: { changes: number } }).meta.changes) !== 1) throw new AccessError("Password changed elsewhere. Sign in again.", 409);
  return NextResponse.json({ success: true }, { headers: { "Set-Cookie": await issueSession(request, merchant.merchantId, passwordHash) } });
});
