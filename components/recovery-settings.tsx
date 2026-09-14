"use client";
import { useState, type FormEvent } from "react";
import { RecoveryCode } from "@/components/recovery-code";
export function RecoverySettings() {
  const [code, setCode] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setBusy(true); setError(""); setCode("");
    try {
      const response = await fetch("/api/auth/recovery-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: data.get("password") }) });
      const result = await response.json() as { error?: string; recoveryCode: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to generate a code.");
      setCode(result.recoveryCode); form.reset();
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }
  return <section><h2>Password recovery</h2><p>Save a recovery code before you need it. A new code replaces your previous code. Email recovery is not configured.</p><form onSubmit={generate}><label>Current password<input name="password" type="password" autoComplete="current-password" required maxLength={128}/></label><button disabled={busy}>{busy ? "Generating…" : "Generate new recovery code"}</button></form>{error && <p role="alert">{error}</p>}{code && <RecoveryCode code={code}/>}</section>;
}
