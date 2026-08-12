"use client";

import { useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type Source = { source: string; chunk: number };
type Msg = { role: "user" | "bot"; text: string; sources?: Source[] };

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
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

  async function ask() {
    if (!question.trim() || busy) return;
    const q = question.trim();
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

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "40px 20px 140px" }}>
      <header className="rise" style={{ textAlign: "center", marginBottom: 32 }}>
        <h1
          style={{
            fontSize: 34,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            textShadow: "0 0 30px rgba(255,255,255,0.35)",
          }}
        >
          RAG Document Q&amp;A
        </h1>
        <p style={{ color: "rgba(255,255,255,0.5)", marginTop: 8 }}>
          Upload a PDF — get answers grounded in it, with citations.
        </p>
      </header>

      <label className="glass glow dropzone rise" style={{ display: "block", padding: 24, cursor: "pointer", textAlign: "center" }}>
        <input
          type="file"
          accept=".pdf"
          style={{ display: "none" }}
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        <div style={{ fontSize: 15, color: "rgba(255,255,255,0.75)" }}>⬆ Click to upload a PDF</div>
        {status && (
          <div className="rise" style={{ marginTop: 10, fontSize: 13, color: status.startsWith("✕") ? "#ff8f8f" : "rgba(255,255,255,0.6)" }}>
            {status}
          </div>
        )}
      </label>

      <section style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 28 }}>
        {messages.map((m, i) => (
          <div key={i} className="rise" style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%" }}>
            <div
              className={m.role === "bot" ? "glass glow" : ""}
              style={{
                padding: "12px 16px",
                borderRadius: 16,
                whiteSpace: "pre-wrap",
                lineHeight: 1.55,
                fontSize: 15,
                ...(m.role === "user"
                  ? {
                      background: "rgba(255,255,255,0.92)",
                      color: "#0a0a0f",
                      boxShadow: "0 0 22px rgba(255,255,255,0.18)",
                    }
                  : {}),
              }}
            >
              {m.text}
            </div>
            {m.sources && m.sources.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {[...new Map(m.sources.map((s) => [`${s.source}#${s.chunk}`, s])).values()].map((s) => (
                  <span
                    key={`${s.source}#${s.chunk}`}
                    className="glass"
                    style={{ fontSize: 11.5, padding: "4px 10px", borderRadius: 999, color: "rgba(255,255,255,0.65)" }}
                  >
                    📄 {s.source} · chunk {s.chunk}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="glass thinking rise" style={{ alignSelf: "flex-start", padding: "12px 18px", borderRadius: 16, display: "flex", gap: 5 }}>
            <span className="dot">●</span>
            <span className="dot">●</span>
            <span className="dot">●</span>
          </div>
        )}
        <div ref={endRef} />
      </section>

      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          padding: "18px 20px 26px",
          background: "linear-gradient(transparent, #07070b 40%)",
        }}
      >
        <div className="glass glow" style={{ maxWidth: 760, margin: "0 auto", display: "flex", gap: 10, padding: 10 }}>
          <input
            className="field"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            placeholder="Ask a question about your documents…"
          />
          <button className="btn" onClick={ask} disabled={busy}>
            Ask
          </button>
        </div>
      </div>
    </main>
  );
}
