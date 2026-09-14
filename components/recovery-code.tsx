"use client";
export function RecoveryCode({ code }: { code: string }) {
  return <section aria-label="Recovery code"><h2>Save your recovery code</h2><p>Keep this in your password manager with your username. Anyone with this code can reset your password. It works once and is only shown now.</p><label>Recovery code<textarea readOnly value={code} rows={3} spellCheck={false} style={{ width: "100%", padding: 12, overflowWrap: "anywhere", fontFamily: "monospace" }} onFocus={(event) => event.currentTarget.select()}/></label><p>Select the code and copy it. Generating another code invalidates this one.</p></section>;
}
