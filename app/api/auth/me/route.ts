import { NextResponse } from "next/server";
import { withMerchant } from "@/lib/auth";
export const GET = withMerchant(async (_request, merchant) => NextResponse.json({ username: merchant.username, storeId: merchant.storeId, storeName: merchant.storeName, role: "owner" }));
