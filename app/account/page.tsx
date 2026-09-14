"use client";
import { useState, type FormEvent } from "react";
import { RecoverySettings } from "@/components/recovery-settings";
import { AccountMenu, useMerchantAccount } from "@/components/merchant-account";
export default function AccountPage() {
  const account = useMerchantAccount(); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  async function change(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: data.get("current"), newPassword: data.get("next") }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error);
      form.reset(); setMessage("Password updated. Other sign-in sessions have been revoked.");
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }
  return <main className="account-settings"><AccountMenu/><a href="/merchant">← Merchant overview</a><div className="account-card"><h1>{account?.storeName}</h1><p>Signed in as {account?.username} · Store owner</p><p><a href="/merchant/catalogue">Manage catalogue</a> · <a href="/demo">Open shopping workspace</a></p><h2>Change password</h2><form onSubmit={change}><label>Current password<input name="current" type="password" required maxLength={128} autoComplete="current-password"/></label><label>New password<input name="next" type="password" required minLength={12} maxLength={128} autoComplete="new-password"/></label><button disabled={busy}>{busy ? "Updating…" : "Update password"}</button></form>{message && <p role="status">{message}</p>}<RecoverySettings/></div></main>;
}
