"use client";

import { useEffect, useRef, useState } from "react";
import Prism from "@/components/Prism";
import ReactMarkdown from "react-markdown";

const API = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

type Source = { source: string; chunk: number };
type Msg = { role: "user" | "bot"; text: string; sources?: Source[] };
type Chat = { id: string; title: string; messages: Msg[]; updated: number };

const SUGGESTIONS = [
  { tag: "Summarize", tagBg: "#bfe3ff", desc: "Give me a summary of this document" },
  { tag: "Key Points", tagBg: "#ffc9c2", desc: "What are the key points?" },
  { tag: "Explain", tagBg: "#c8f5b8", desc: "Explain the main topic in simple terms" },
];

const newId = () => Math.random().toString(36).slice(2, 10);

export default function Home() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatId, setChatId] = useState(newId);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [documents, setDocuments] = useState<string[]>([]);
  const [source, setSource] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  // chat history persistence (localStorage)
  useEffect(() => {
    try {
      setChats(JSON.parse(localStorage.getItem("rag_chats") ?? "[]"));
    } catch {}
  }, []);

  useEffect(() => {
    if (messages.length === 0) return;
    setChats((prev) => {
      const title = messages.find((m) => m.role === "user")?.text.slice(0, 42) || "New chat";
      const rest = prev.filter((c) => c.id !== chatId);
      const next = [{ id: chatId, title, messages, updated: Date.now() }, ...rest].slice(0, 50);
      try {
        localStorage.setItem("rag_chats", JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [messages, chatId]);

  function newChat() {
    if (busy) return;
    setChatId(newId());
    setMessages([]);
    setStatus("");
  }

  function openChat(c: Chat) {
    if (busy) return;
    setChatId(c.id);
    setMessages(c.messages);
  }

  function deleteChat(id: string) {
    setChats((prev) => {
      const next = prev.filter((c) => c.id !== id);
      try {
        localStorage.setItem("rag_chats", JSON.stringify(next));
      } catch {}
      return next;
    });
    if (id === chatId) newChat();
  }

  async function loadDocuments() {
    try {
      const res = await fetch(`${API}/documents`);
      const data = await res.json();
      setDocuments(data.documents ?? []);
    } catch {
      /* ponytail: filter row just stays hidden if the backend is down */
    }
  }

  useEffect(() => {
    loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function upload(file: File) {
    setStatus(`Uploading ${file.name}…`);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`${API}/ingest`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      setStatus(`✓ ${data.filename} is ready to chat`);
      loadDocuments();
    } catch (e) {
      setStatus(`✕ ${e instanceof Error ? e.message : "upload failed"}`);
    }
  }

  async function ask(text?: string) {
    const q = (text ?? question).trim();
    if (!q || busy) return;
    setQuestion("");
    const history = messages.slice(-6).map(({ role, text }) => ({ role, text }));
    setMessages((m) => [...m, { role: "user", text: q }, { role: "bot", text: "" }]);
    setBusy(true);

    // mutate the last (bot) message in place via functional updates
    const patchBot = (fn: (b: Msg) => Msg) =>
      setMessages((m) => [...m.slice(0, -1), fn(m[m.length - 1])]);

    try {
      const res = await fetch(`${API}/ask/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history, source }),
      });
      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => "");
        throw new Error(detail || `request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // keep partial line for next chunk
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const ev = JSON.parse(line.slice(5).trim());
          if (ev.type === "token") patchBot((b) => ({ ...b, text: b.text + ev.text }));
          else if (ev.type === "sources") patchBot((b) => ({ ...b, sources: ev.sources }));
          else if (ev.type === "error") throw new Error(ev.detail);
        }
      }
    } catch (e) {
      const msg = `✕ ${e instanceof Error ? e.message : "request failed"}`;
      patchBot((b) => ({ ...b, text: b.text ? `${b.text}\n${msg}` : msg }));
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

      {/* sidebar: new chat + history */}
      <aside className="sidebar">
        <button className="new-chat" onClick={newChat}>
          <span style={{ fontSize: 17, lineHeight: 1 }}>＋</span> New chat
        </button>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", margin: "18px 6px 8px" }}>
          History
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {chats.length === 0 && (
            <div style={{ fontSize: 12.5, color: "var(--muted)", padding: "4px 6px" }}>No chats yet</div>
          )}
          {chats.map((c) => (
            <div key={c.id} className={`chat-item ${c.id === chatId ? "active" : ""}`} onClick={() => openChat(c)}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{c.title}</span>
              <button
                className="chat-del"
                aria-label="Delete chat"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteChat(c.id);
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </aside>

      <main className="content" style={{ position: "relative", zIndex: 1, maxWidth: 780, margin: "0 auto", padding: "0 20px 60px", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
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
            {messages.filter((m) => m.text || m.sources).map((m, i) => (
              <div key={i} className="rise" style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%" }}>
                <div
                  className={m.role === "bot" ? "card" : ""}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 16,
                    whiteSpace: m.role === "user" ? "pre-wrap" : undefined,
                    lineHeight: 1.6,
                    fontSize: 15,
                    ...(m.role === "user" ? { background: "var(--mint)", color: "#05201b", fontWeight: 500 } : {}),
                  }}
                >
                  {m.role === "bot" ? <div className="md"><ReactMarkdown>{m.text}</ReactMarkdown></div> : m.text}
                </div>
                {m.sources && m.sources.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {[...new Set(m.sources.map((s) => s.source))].map((name) => (
                      <span key={name} className="card" style={{ fontSize: 11.5, padding: "4px 10px", borderRadius: 999, color: "var(--muted)" }}>
                        📄 {name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && !messages[messages.length - 1]?.text && (
              <div className="card rise" style={{ alignSelf: "flex-start", padding: "12px 18px", display: "flex", gap: 5 }}>
                <span className="dot">●</span>
                <span className="dot">●</span>
                <span className="dot">●</span>
              </div>
            )}
            <div ref={endRef} />
          </section>
        )}

        {documents.length > 0 && (
          <div className="rise" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {[null, ...documents].map((doc) => {
              const active = source === doc;
              return (
                <button
                  key={doc ?? "__all__"}
                  className="attach"
                  onClick={() => setSource(doc)}
                  style={active ? { borderColor: "var(--mint)", color: "var(--mint)", background: "rgba(46, 230, 200, 0.08)" } : undefined}
                >
                  {doc ?? "All documents"}
                </button>
              );
            })}
          </div>
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
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button className="attach" onClick={() => fileRef.current?.click()}>
              🖇 Attach file
            </button>
            {SUGGESTIONS.map((s) => (
              <button
                key={s.tag}
                className="attach"
                style={{ borderColor: "transparent", background: s.tagBg + "22", color: "var(--text)" }}
                onClick={() => ask(s.desc)}
                disabled={busy}
              >
                {s.tag}
              </button>
            ))}
            <button className="send" onClick={() => ask()} disabled={busy} aria-label="Send" style={{ marginLeft: "auto" }}>↑</button>
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
