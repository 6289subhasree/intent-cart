import { withMerchant } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getAuditBundle } from "@/db/repository";
import { displayCart } from "@/lib/commerce";

export const GET = withMerchant(async (request, merchant) => {
  try {
    const bundle = await getAuditBundle(new URL(request.url).searchParams.get("sessionId"), merchant.storeId);
    if (!bundle) return NextResponse.json({ error: "No shopping sessions have been recorded yet." }, { status: 404 });
    return NextResponse.json({ ...bundle, items: displayCart(bundle.session.cart, undefined, merchant.catalogue) });
  } catch (error) {
    console.error("Failed to load audit trail", error);
    return NextResponse.json({ error: "The audit trail is temporarily unavailable." }, { status: 503 });
  }
});
