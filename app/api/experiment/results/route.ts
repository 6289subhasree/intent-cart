import { NextResponse } from "next/server";
import { database } from "@/db/repository";
import { withMerchant, AccessError } from "@/lib/auth";
import { EXPERIMENT_ID, experimentAdmin, experimentEnabled } from "@/lib/experiment";
export const GET = withMerchant(async (_request, merchant) => {
  if (!experimentAdmin(merchant.username)) throw new AccessError("Experiment results require administrator access.", 403);
  const cutoff = Date.now() - 86400000;
  const rows = await (await database()).prepare(`SELECT variant, COUNT(*) AS assigned,
    SUM(exposed_at IS NOT NULL) AS exposed,
    SUM(exposed_at <= ?) AS mature,
    SUM(exposed_at <= ? AND converted_at IS NOT NULL) AS converted,
    SUM(exposed_at <= ? AND ordered_at IS NOT NULL) AS ordered
    FROM experiment_assignments GROUP BY variant`).bind(cutoff, cutoff, cutoff).all();
  return NextResponse.json({ experimentId: EXPERIMENT_ID, enabled: experimentEnabled(), variants: ["A", "B"].map(variant => ({ variant, assigned: 0, exposed: 0, mature: 0, converted: 0, ordered: 0, ...rows.results.find(row => row.variant === variant) })) });
});
