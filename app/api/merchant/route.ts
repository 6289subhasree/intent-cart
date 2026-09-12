import { NextResponse } from "next/server";
import { getMerchantSnapshot } from "@/db/repository";

export async function GET() {
  try { return NextResponse.json(await getMerchantSnapshot()); }
  catch (error) { console.error("Failed to load merchant snapshot", error); return NextResponse.json({ error: "Merchant analytics are temporarily unavailable." }, { status: 503 }); }
}
