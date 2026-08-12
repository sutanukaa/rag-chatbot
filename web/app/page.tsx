"use client";

import { useEffect, useRef, useState } from "react";
import Prism from "@/components/Prism";

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type Source = { source: string; chunk: number };
type Msg = { role: "user" | "bot"; text: string; sources?: Source[] };

const SUGGESTIONS = [
  { tag: "Summarize", tagBg: "#bfe3ff", desc: "Give me a summary of this document" },
  { tag: "Key Points", tagBg: "#ffc9c2", desc: "What are the key points?" },
  { tag: "Explain", tagBg: "#c8f5b8", desc: "Explain the main topic in simple terms" },
];

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function upload(file: File) {
    setStatus(`Uploading ${file.name}…`);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`${API}/ingest`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      setStatus(`✓ ${data.filename} — ${data.chunks_stored} chunks indexed`);
    } catch (e) {
      setStatus(`✕ ${e instanceof Error ? e.message : "upload failed"}`);
    }
  }

  async function ask(text?: string) {
    const q = (text ?? question).trim();
    if (!q || busy) return;
    setQuestion("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const res = await fetch(`${API}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      setMessages((m) => [...m, { role: "bot", text: data.answer, sources: data.sources }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "bot", text: `✕ ${e instanceof Error ? e.message : "request failed"}` }]);
    } finally {
      setBusy(false);
    }
  }

  const empty = messages.length === 0;

  return (
    <>
      <div className="grid-bg" />
      {/* prism blob behind the hero, top-center like the inspo */}
      <div style={{ position: "fixed", top: "-18vh", left: 0, right: 0, height: "75vh", zIndex: 0, opacity: 0.85 }}>
        <Prism animationType="3drotate" timeScale={0.35} scale={2.6} glow={1.4} bloom={1.2} noise={0.06} hueShift={0.35} colorFrequency={0.85} suspendWhenOffscreen />
      </div>

      <main style={{ position: "relative", zIndex: 1, maxWidth: 780, margin: "0 auto", padding: "0 20px 60px", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <div style={{ flex: empty ? "0 0 30vh" : "0 0 8vh" }} />

        {empty && (
          <header className="rise" style={{ marginBottom: 28 }}>
            <h1 style={{ fontSize: 42, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.15 }}>
              Hey! <span style={{ color: "var(--muted)" }}>Ask your</span> documents<span style={{ color: "var(--mint)" }}>.</span>
            </h1>
            <p style={{ color: "var(--muted)", marginTop: 10, fontSize: 15 }}>
              Attach a PDF, then ask anything — answers come with citations.
            </p>
          </header>
        )}

        {empty && (
          <div className="rise" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 22 }}>
            {SUGGESTIONS.map((s) => (
              <div key={s.tag} className="card suggestion" style={{ padding: 16 }} onClick={() => ask(s.desc)}>
                <span className="tag" style={{ background: s.tagBg, color: "#0a0d0d" }}>{s.tag}</span>
                <p style={{ marginTop: 12, fontSize: 13.5, color: "var(--muted)" }}>{s.desc}</p>
              </div>
            ))}
          </div>
        )}

        {!empty && (
          <section style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 24 }}>
            {messages.map((m, i) => (
              <div key={i} className="rise" style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%" }}>
                <div
                  className={m.role === "bot" ? "card" : ""}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 16,
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.6,
                    fontSize: 15,
                    ...(m.role === "user" ? { background: "var(--mint)", color: "#05201b", fontWeight: 500 } : {}),
                  }}
                >
                  {m.text}
                </div>
                {m.sources && m.sources.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {[...new Map(m.sources.map((s) => [`${s.source}#${s.chunk}`, s])).values()].map((s) => (
                      <span key={`${s.source}#${s.chunk}`} className="card" style={{ fontSize: 11.5, padding: "4px 10px", borderRadius: 999, color: "var(--muted)" }}>
                        📄 {s.source} · chunk {s.chunk}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className="card rise" style={{ alignSelf: "flex-start", padding: "12px 18px", display: "flex", gap: 5 }}>
                <span className="dot">●</span>
                <span className="dot">●</span>
                <span className="dot">●</span>
              </div>
            )}
            <div ref={endRef} />
          </section>
        )}

        {/* composer */}
        <div className="card rise" style={{ padding: 18, boxShadow: "0 20px 60px rgba(0,0,0,0.45)" }}>
          <div style={{ color: "var(--mint)", fontSize: 18, marginBottom: 6 }}>✦</div>
          <input
            className="composer-input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            placeholder="Ask me anything……"
          />
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <button className="attach" onClick={() => fileRef.current?.click()}>
              🖇 Attach file
            </button>
            <button className="send" onClick={() => ask()} disabled={busy} aria-label="Send">↑</button>
          </div>
          <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          {status && (
            <div className="rise" style={{ marginTop: 10, fontSize: 13, color: status.startsWith("✕") ? "#ff8f8f" : "var(--mint)" }}>
              {status}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
