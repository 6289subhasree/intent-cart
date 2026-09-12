import { NextRequest, NextResponse } from "next/server";
import { getAuditBundle } from "@/db/repository";
import { displayCart } from "@/lib/commerce";

export async function GET(request: NextRequest) {
  try {
    const bundle = await getAuditBundle(request.nextUrl.searchParams.get("sessionId"));
    if (!bundle) return NextResponse.json({ error: "No shopping sessions have been recorded yet." }, { status: 404 });
    return NextResponse.json({ ...bundle, items: displayCart(bundle.session.cart) });
  } catch (error) {
    console.error("Failed to load audit trail", error);
    return NextResponse.json({ error: "The audit trail is temporarily unavailable." }, { status: 503 });
  }
}
