"use client";

import Link from "next/link";
import Prism from "@/components/Prism";

export default function NotFound() {
  return (
    <>
      <div className="grid-bg" />
      <div style={{ position: "fixed", top: "-18vh", left: 0, right: 0, height: "75vh", zIndex: 0, opacity: 0.85 }}>
        <Prism animationType="3drotate" timeScale={0.35} scale={2.6} glow={1.4} bloom={1.2} noise={0.06} hueShift={0.35} colorFrequency={0.85} suspendWhenOffscreen />
      </div>
      <main style={{ position: "relative", zIndex: 1, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div className="card rise" style={{ padding: 36, maxWidth: 380, width: "100%", textAlign: "center" }}>
          <div style={{ color: "var(--mint)", fontSize: 26, marginBottom: 10 }}>✦</div>
          <h1 style={{ fontSize: 42, fontWeight: 600, letterSpacing: "-0.03em" }}>
            404<span style={{ color: "var(--mint)" }}>.</span>
          </h1>
          <p style={{ color: "var(--muted)", margin: "10px 0 24px", fontSize: 14 }}>
            This page doesn&apos;t exist — but your documents still do.
          </p>
          <Link href="/" className="oauth" style={{ display: "block", textDecoration: "none", color: "var(--text)" }}>
            Back to chat
          </Link>
        </div>
      </main>
    </>
  );
}
