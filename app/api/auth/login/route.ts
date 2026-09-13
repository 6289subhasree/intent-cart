import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/db/repository";
import { apiBoundary, checkOrigin, issueSession, rateLimit, readJson, verifyPassword, AccessError } from "@/lib/auth";
const schema = z.object({ username: z.string().trim().toLowerCase().min(3).max(32), password: z.string().min(1).max(128) }).strict();
export function POST(request: Request) { return apiBoundary(async () => {
  checkOrigin(request);
  await rateLimit(`login-ip:${request.headers.get("cf-connecting-ip") ?? "local"}`, 40);
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) throw new AccessError("Enter your username and password.", 400);
  await rateLimit(`login-user:${parsed.data.username}`, 8);
  const row = await (await database()).prepare("SELECT id, password_hash FROM merchants WHERE username = ?").bind(parsed.data.username).first();
  if (!await verifyPassword(parsed.data.password, row ? String(row.password_hash) : undefined) || !row) throw new AccessError("Incorrect username or password.");
  return NextResponse.json({ success: true }, { headers: { "Set-Cookie": await issueSession(request, String(row.id), String(row.password_hash)) } });
}); }
