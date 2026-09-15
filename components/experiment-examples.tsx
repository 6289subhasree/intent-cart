"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
type Assignment = { enabled: boolean; variant?: "A" | "B"; examples?: string[] };
export function ExperimentExamples({ children, onSelect, disabled }: { children: ReactNode; onSelect: (text: string) => void; disabled: boolean }) {
  const [assignment, setAssignment] = useState<Assignment>({ enabled: false }); const box = useRef<HTMLDivElement>(null);
  useEffect(() => { let alive = true; fetch("/api/experiment").then(async response => { if (response.ok) { const data = await response.json() as Assignment; if (alive) setAssignment(data); } }).catch(() => {}); return () => { alive = false; }; }, []);
  useEffect(() => {
    if (!assignment.enabled || !box.current) return;
    let sent = false;
    const observer = new IntersectionObserver(entries => {
      if (document.visibilityState !== "visible" || sent || !entries.some(entry => entry.isIntersecting)) return;
      sent = true;
      fetch("/api/experiment", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", keepalive: true }).catch(() => {});
    });
    observer.observe(box.current);
    const visible = () => { if (box.current) { observer.unobserve(box.current); observer.observe(box.current); } };
    document.addEventListener("visibilitychange", visible);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", visible); };
  }, [assignment]);
  return <div ref={box}>{assignment.enabled && assignment.variant === "B" && <div aria-label="Example shopping requests"><p>Try a request from this store</p>{assignment.examples?.map(example => <button key={example} type="button" disabled={disabled} onClick={() => onSelect(example)} style={{ display: "block", textAlign: "left", marginBottom: 8, padding: 10, border: "1px solid #ddd6fe", borderRadius: 10 }}>{example}</button>)}</div>}{children}</div>;
}
