"use client";

import { useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type Msg = { role: "user" | "bot"; text: string; sources?: { source: string; chunk: number }[] };

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setStatus(`Uploading ${file.name}...`);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`${API}/ingest`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      setStatus(`✓ ${data.filename}: ${data.chunks_stored} chunks indexed`);
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : "upload failed"}`);
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
      setMessages((m) => [...m, { role: "bot", text: `Error: ${e instanceof Error ? e.message : "request failed"}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 24 }}>📄 RAG Document Q&amp;A</h1>
      <p style={{ color: "#666" }}>Upload a PDF, then ask questions about it. Answers are grounded in the document with citations.</p>

      <div style={{ border: "2px dashed #ccc", borderRadius: 8, padding: 16, margin: "16px 0" }}>
        <input type="file" accept=".pdf" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <div style={{ marginTop: 8, fontSize: 14, color: "#444" }}>{status}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 200 }}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              background: m.role === "user" ? "#2563eb" : "#f1f5f9",
              color: m.role === "user" ? "#fff" : "#111",
              borderRadius: 12,
              padding: "10px 14px",
              maxWidth: "85%",
              whiteSpace: "pre-wrap",
            }}
          >
            {m.text}
            {m.sources && (
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
                Sources: {[...new Set(m.sources.map((s) => `${s.source} #${s.chunk}`))].join(", ")}
              </div>
            )}
          </div>
        ))}
        {busy && <div style={{ color: "#888" }}>Thinking…</div>}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder="Ask a question about your documents…"
          style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid #ccc", fontSize: 15 }}
        />
        <button
          onClick={ask}
          disabled={busy}
          style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", cursor: "pointer" }}
        >
          Ask
        </button>
      </div>
    </main>
  );
}
