"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
type Account = { username: string; storeId: string; storeName: string; role: string };
const AccountContext = createContext<Account | null>(null);
export const useMerchantAccount = () => useContext(AccountContext);
export function AccountGate({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { cache: "no-store" }).then(async (response) => {
      if (response.status === 401) { window.location.replace("/login"); return; }
      const data = await response.json() as Account & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to load your account.");
      if (active) setAccount(data);
    }).catch((cause) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, []);
  if (!account) return <main className="account-screen"><div className="account-card"><a className="account-brand" href="/">IntentCart</a><h1>{error ? "Unable to open your store" : "Opening your workspace…"}</h1><p role="status">{error ?? "Checking your merchant session."}</p>{error && <button onClick={() => window.location.reload()}>Try again</button>}</div></main>;
  return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>;
}
export function AccountMenu() {
  const account = useMerchantAccount();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error("Could not sign out. Please retry.");
      window.location.replace("/login");
    } catch (cause) { setError((cause as Error).message); setBusy(false); }
  }
  return <div className="account-menu"><a href="/account">{account?.storeName ?? "Your account"}</a><button disabled={busy} onClick={logout}>{busy ? "Signing out…" : "Sign out"}</button>{error && <span role="alert">{error}</span>}</div>;
}
