import { withMerchant } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getMerchantSnapshot } from "@/db/repository";

export const GET = withMerchant(async (_request, merchant) => {
  try { return NextResponse.json({ ...await getMerchantSnapshot(merchant.storeId), storeName: merchant.storeName, productCount: merchant.catalogue.length }); }
  catch (error) { console.error("Failed to load merchant snapshot", error); return NextResponse.json({ error: "Merchant analytics are temporarily unavailable." }, { status: 503 }); }
});
