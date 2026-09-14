import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/db/repository";
import { AccessError, hashToken, newRecoveryCode, rateLimit, readJson, verifyPassword, withMerchant } from "@/lib/auth";

const schema = z.object({ currentPassword: z.string().min(1).max(128) }).strict();
export const POST = withMerchant(async (request, merchant) => {
  await rateLimit(`recovery-code:${merchant.merchantId}`, 5);
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) throw new AccessError("Enter your current password.", 400);
  const db = await database();
  const row = await db.prepare("SELECT password_hash, recovery_hash FROM merchants WHERE id = ?").bind(merchant.merchantId).first();
  if (!row || !await verifyPassword(parsed.data.currentPassword, String(row.password_hash))) throw new AccessError("Current password is incorrect.", 403);
  const recoveryCode = newRecoveryCode();
  const changed = await db.prepare("UPDATE merchants SET recovery_hash = ? WHERE id = ? AND password_hash = ? AND recovery_hash IS ? RETURNING id").bind(hashToken(recoveryCode), merchant.merchantId, row.password_hash, row.recovery_hash ?? null).first();
  if (!changed) throw new AccessError("Account credentials changed elsewhere. Please try again.", 409);
  return NextResponse.json({ recoveryCode });
});
