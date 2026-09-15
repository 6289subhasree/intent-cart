"use client";
import { useEffect, useState } from "react";
import { AccountMenu } from "@/components/merchant-account";
type Results = { enabled: boolean; experimentId: string; variants: { variant: string; assigned: number; exposed: number; mature: number; converted: number; ordered: number }[] };
export default function ExperimentPage() {
  const [data, setData] = useState<Results | null>(null); const [error, setError] = useState("");
  async function load() { setError(""); try { const response = await fetch("/api/experiment/results"); const result = await response.json() as Results & { error?: string }; if (!response.ok) throw new Error(result.error); setData(result); } catch (cause) { setError((cause as Error).message); } }
  useEffect(() => { void load(); }, []);
  return <main className="catalogue-settings"><AccountMenu/><a href="/merchant">← Merchant overview</a><h1>First-cart experiment</h1><p>A: request box · B: request box with category examples.</p><button onClick={() => void load()}>Refresh results</button>{error && <p role="alert">{error}</p>}{data && <><p>Enrollment and tracking: {data.enabled ? "enabled" : "disabled"}</p><p>Only merchants whose 24-hour observation window has finished enter the conversion rates below. These are test-order outcomes, not paid purchases.</p><div style={{ overflowX: "auto" }}><table><thead><tr><th>Variant</th><th>Assigned</th><th>Exposed</th><th>Finished 24h</th><th>First cart</th><th>Cart rate</th><th>First-cart orders</th></tr></thead><tbody>{data.variants.map(v => <tr key={v.variant}><td>{v.variant}</td><td>{v.assigned}</td><td>{v.exposed}</td><td>{v.mature}</td><td>{v.converted}</td><td>{v.mature ? `${(100 * v.converted / v.mature).toFixed(1)}%` : "Not enough observation time"}</td><td>{v.ordered}</td></tr>)}</tbody></table></div><p>No winner is declared automatically. Agree on traffic, sample size and stopping rules before interpreting any difference.</p></>}</main>;
}
