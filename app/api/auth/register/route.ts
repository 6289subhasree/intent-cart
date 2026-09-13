import { NextResponse } from "next/server";
import { z } from "zod";
import { apiBoundary, checkOrigin, createMerchant, issueSession, rateLimit, readJson, AccessError } from "@/lib/auth";
const schema = z.object({ username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,32}$/), password: z.string().min(12).max(128), storeName: z.string().trim().min(2).max(80) }).strict();
export function POST(request: Request) { return apiBoundary(async () => {
  checkOrigin(request);
  await rateLimit(`register:${request.headers.get("cf-connecting-ip") ?? "local"}`, 10);
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) throw new AccessError("Use a 3–32 character username (letters, numbers, underscores), a 12–128 character password and a store name.", 400);
  const id = await createMerchant(parsed.data.username, parsed.data.password, parsed.data.storeName);
  return NextResponse.json({ success: true }, { status: 201, headers: { "Set-Cookie": await issueSession(request, id) } });
}); }
