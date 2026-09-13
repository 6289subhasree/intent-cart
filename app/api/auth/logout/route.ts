import { NextResponse } from "next/server";
import { database } from "@/db/repository";
import { apiBoundary, checkOrigin, clearCookie, hashToken, tokenFrom } from "@/lib/auth";
export function POST(request: Request) { return apiBoundary(async () => {
  checkOrigin(request); const token = tokenFrom(request);
  if (token) await (await database()).prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(hashToken(token)).run();
  return NextResponse.json({ success: true }, { headers: { "Set-Cookie": clearCookie(request) } });
}); }
