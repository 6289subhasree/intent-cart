"use client";
import { useState, type FormEvent } from "react";
export default function RecoverPage() {
  const [done, setDone] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function reset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setError("");
    if (data.get("password") !== data.get("confirm")) { setError("The passwords do not match."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: data.get("username"), recoveryCode: data.get("code"), newPassword: data.get("password") }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to reset password.");
      form.reset(); setDone(true);
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }
  return <main className="account-screen"><section className="account-intro"><a className="account-brand" href="/">IntentCart</a><h1>Get back to<br/>your store.</h1><p>Use the recovery code you saved at signup or generated in your account settings. Without a saved code, this form cannot recover your account.</p></section><section className="account-card">{done ? <><h2>Password reset</h2><p>Your old sessions have been signed out and your recovery code has been used. Sign in with your new password, then generate and save a new recovery code in your account settings.</p><a href="/login">Back to sign in →</a></> : <><h2>Reset password</h2><form onSubmit={reset}><label>Username<input name="username" required minLength={3} maxLength={32} autoComplete="username" autoCapitalize="none"/></label><label>Recovery code<input name="code" type="password" required minLength={64} maxLength={64} autoComplete="off" spellCheck={false}/></label><label>New password<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password"/></label><label>Confirm new password<input name="confirm" type="password" required minLength={12} maxLength={128} autoComplete="new-password"/></label>{error && <p className="account-error" role="alert">{error}</p>}<button disabled={busy}>{busy ? "Resetting…" : "Reset password"}</button></form><a href="/login">Back to sign in</a></>}</section></main>;
}
