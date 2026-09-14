"use client";
import { useState, type FormEvent } from "react";
import { RecoveryCode } from "@/components/recovery-code";
export default function LoginPage() {
  const [register, setRegister] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(null);
    try {
      const body = { username: form.get("username"), password: form.get("password"), ...(register ? { storeName: form.get("storeName") } : {}) };
      const response = await fetch(`/api/auth/${register ? "register" : "login"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { error?: string; recoveryCode?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to sign in.");
      if (result.recoveryCode) { setRecoveryCode(result.recoveryCode); setBusy(false); }
      else window.location.assign("/merchant");
    } catch (cause) { setError((cause as Error).message); setBusy(false); }
  }
  if (recoveryCode) return <main className="account-screen"><section className="account-card"><RecoveryCode code={recoveryCode}/><a href="/merchant">I saved my code — open my store →</a></section></main>;
  return <main className="account-screen"><section className="account-intro"><a href="/" className="account-brand">IntentCart</a><p className="account-eyebrow">YOUR STORE. YOUR WORKSPACE.</p><h1>Commerce, with<br/>you in control.</h1><p>Manage your catalogue, test shopping requests and follow every order through its audit trail.</p></section><section className="account-card"><p className="account-eyebrow">MERCHANT ACCOUNT</p><h2>{register ? "Create your store" : "Welcome back"}</h2><p>{register ? "Start with your own copy of the sample catalogue. You can edit it after signing up." : "Sign in to open your store’s private workspace."}</p><form onSubmit={submit}>
    {register && <label>Store name<input name="storeName" required minLength={2} maxLength={80} autoComplete="organization" placeholder="Your store name" /></label>}
    <label>Username<input name="username" required minLength={3} maxLength={32} pattern="[A-Za-z0-9_]+" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="e.g. subhasree_store" /></label>
    <label>Password<input name="password" type="password" required minLength={register ? 12 : 1} maxLength={128} autoComplete={register ? "new-password" : "current-password"} /></label>
    {register ? <p className="account-hint">Use at least 12 characters. You’ll receive a recovery code to save after signup.</p> : <a href="/recover">Forgot password?</a>}
    {error && <p className="account-error" role="alert">{error}</p>}
    <button disabled={busy} type="submit">{busy ? "Please wait…" : register ? "Create store" : "Sign in"}</button>
  </form><button className="account-switch" disabled={busy} onClick={() => { setRegister(!register); setError(null); }}>{register ? "Already have an account? Sign in" : "New here? Create a store"}</button></section></main>;
}
