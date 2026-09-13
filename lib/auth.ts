import { pbkdf2, randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { database } from "@/db/repository";
import { catalogue, type CatalogueProduct } from "@/lib/commerce";

const COOKIE = "intentcart_session";
const LIFETIME = 7 * 24 * 60 * 60;
export type MerchantContext = { merchantId: string; username: string; storeId: string; storeName: string; catalogue: CatalogueProduct[]; catalogueVersion: string };
export class AccessError extends Error {
  constructor(message: string, public status = 401) { super(message); }
}
export const hashToken = (value: string) => createHash("sha256").update(value).digest("hex");

function derive(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => pbkdf2(password, salt, 600000, 32, "sha256", (error, key) => error ? reject(error) : resolve(key)));
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `pbkdf2-sha256$600000$${salt}$${(await derive(password, salt)).toString("hex")}`;
}
export async function verifyPassword(password: string, stored?: string) {
  const parts = stored?.split("$");
  const salt = parts?.[2] ?? "00000000000000000000000000000000";
  const actual = await derive(password, salt);
  const expected = Buffer.from(parts?.[3] ?? "00".repeat(32), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual) && Boolean(stored);
}

export function checkOrigin(request: Request) {
  const url = new URL(request.url);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new AccessError("HTTPS is required.", 403);
  if (request.headers.get("origin") !== url.origin || request.headers.get("sec-fetch-site") === "cross-site") throw new AccessError("Request origin was rejected.", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AccessError("JSON requests are required.", 415);
}
export async function readJson(request: Request, limit = 16384): Promise<unknown> {
  if (Number(request.headers.get("content-length") ?? 0) > limit) throw new AccessError("Request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AccessError("Request body is required.", 400);
  let text = ""; let size = 0; const decoder = new TextDecoder();
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > limit) { await reader.cancel(); throw new AccessError("Request is too large.", 413); }
    text += decoder.decode(part.value, { stream: true });
  }
  try { return JSON.parse(text + decoder.decode()); } catch { throw new AccessError("Invalid JSON.", 400); }
}
export function tokenFrom(request: Request) {
  const token = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}
export async function merchantFor(request: Request): Promise<MerchantContext> {
  const token = tokenFrom(request);
  if (!token) throw new AccessError("Sign in to your merchant account.");
  const row = await (await database()).prepare(`SELECT m.id, m.username, s.id AS store_id, s.name, s.catalogue_json, s.catalogue_version
    FROM auth_sessions a JOIN merchants m ON m.id = a.merchant_id JOIN stores s ON s.owner_id = m.id
    WHERE a.token_hash = ? AND a.expires_at > ?`).bind(hashToken(token), Date.now()).first();
  if (!row) throw new AccessError("Your session expired. Please sign in again.");
  return { merchantId: String(row.id), username: String(row.username), storeId: String(row.store_id), storeName: String(row.name), catalogue: JSON.parse(String(row.catalogue_json)), catalogueVersion: String(row.catalogue_version) };
}
export async function rateLimit(key: string, limit: number, seconds = 900) {
  const db = await database(); const now = Date.now(); const bucket = Math.floor(now / (seconds * 1000));
  const scopedKey = hashToken(`${key}:${bucket}`);
  const row = await db.prepare(`INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count`).bind(scopedKey, (bucket + 1) * seconds * 1000).first<{ count: number }>();
  if (!row || row.count > limit) throw new AccessError("Too many attempts. Please try again later.", 429);
}
export async function createMerchant(username: string, password: string, name: string) {
  const db = await database(); const merchantId = crypto.randomUUID(); const storeId = crypto.randomUUID(); const now = new Date().toISOString();
  const passwordHash = await hashPassword(password);
  try {
    await db.batch([
      db.prepare("INSERT INTO merchants (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)").bind(merchantId, username, passwordHash, now),
      db.prepare("INSERT INTO stores (id, owner_id, name, catalogue_json, catalogue_version, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(storeId, merchantId, name, JSON.stringify(catalogue), crypto.randomUUID(), now),
    ]);
  } catch (error) {
    if (await db.prepare("SELECT id FROM merchants WHERE username = ?").bind(username).first()) throw new AccessError("That username is unavailable.", 409);
    throw error;
  }
  return merchantId;
}
export async function issueSession(request: Request, merchantId: string, expectedPasswordHash?: string) {
  const db = await database(); const token = randomBytes(32).toString("hex");
  const old = tokenFrom(request);
  const results = await db.batch([
    db.prepare("DELETE FROM auth_sessions WHERE expires_at <= ? OR token_hash = ?").bind(Date.now(), old ? hashToken(old) : ""),
    db.prepare("DELETE FROM rate_limits WHERE expires_at <= ?").bind(Date.now()),
    db.prepare("INSERT INTO auth_sessions (token_hash, merchant_id, expires_at) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM merchants WHERE id = ? AND (? IS NULL OR password_hash = ?))").bind(hashToken(token), merchantId, Date.now() + LIFETIME * 1000, merchantId, expectedPasswordHash ?? null, expectedPasswordHash ?? null),
  ]);
  if (Number((results[2] as { meta: { changes: number } }).meta.changes) !== 1) throw new AccessError("Credentials changed. Please sign in again.");
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${LIFETIME}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
export function clearCookie(request: Request) { return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`; }
export async function apiBoundary(work: () => Promise<Response>) {
  try { const response = await work(); response.headers.set("Cache-Control", "no-store"); return response; }
  catch (error) {
    return NextResponse.json({ error: error instanceof AccessError ? error.message : "The service is temporarily unavailable. Please try again." }, { status: error instanceof AccessError ? error.status : 503, headers: { "Cache-Control": "no-store" } });
  }
}
export function withMerchant(work: (request: Request, merchant: MerchantContext) => Promise<Response>) {
  return (request: Request) => apiBoundary(async () => {
    if (request.method !== "GET") checkOrigin(request);
    const merchant = await merchantFor(request);
    await rateLimit(`api:${merchant.merchantId}`, 300);
    return work(request, merchant);
  });
}
