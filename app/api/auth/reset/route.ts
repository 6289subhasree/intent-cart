import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { z } from "zod";
import { database } from "@/db/repository";
import { AccessError, apiBoundary, checkOrigin, clearCookie, hashPassword, hashToken, rateLimit, readJson } from "@/lib/auth";

const schema = z.object({ username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,32}$/), recoveryCode: z.string().trim().toLowerCase().regex(/^[a-f0-9]{64}$/), newPassword: z.string().min(12).max(128) }).strict();
const invalid = () => new AccessError("Username or recovery code is invalid, or the code has already been used.", 400);
export function POST(request: Request) { return apiBoundary(async () => {
  checkOrigin(request);
  await rateLimit(`reset-ip:${request.headers.get("cf-connecting-ip") ?? "local"}`, 20);
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) throw new AccessError("Enter your username, 64-character recovery code and a new password of 12–128 characters.", 400);
  await rateLimit(`reset-user:${parsed.data.username}`, 5);
  const db = await database();
  const row = await db.prepare("SELECT id, password_hash, recovery_hash FROM merchants WHERE username = ?").bind(parsed.data.username).first();
  const codeHash = hashToken(parsed.data.recoveryCode);
  const expected = Buffer.from(String(row?.recovery_hash ?? "00".repeat(32)), "hex");
  const matches = expected.length === 32 && timingSafeEqual(Buffer.from(codeHash, "hex"), expected);
  if (!matches || !row?.recovery_hash) throw invalid();
  const passwordHash = await hashPassword(parsed.data.newPassword);
  // Consume the code and revoke sessions in the same transaction. Only one reset can win.
  const changed = await db.batch([
    db.prepare("UPDATE merchants SET password_hash = ?, recovery_hash = NULL WHERE id = ? AND recovery_hash = ? AND password_hash = ?").bind(passwordHash, row.id, codeHash, row.password_hash),
    db.prepare("DELETE FROM auth_sessions WHERE merchant_id = ? AND EXISTS (SELECT 1 FROM merchants WHERE id = ? AND password_hash = ?)").bind(row.id, row.id, passwordHash),
  ]);
  if (Number((changed[0] as { meta: { changes: number } }).meta.changes) !== 1) throw invalid();
  return NextResponse.json({ success: true }, { headers: { "Set-Cookie": clearCookie(request) } });
}); }
