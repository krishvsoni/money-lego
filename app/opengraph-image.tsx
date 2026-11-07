import { ImageResponse } from "next/og";
import { MARK_ACCENT, MARK_BASE, MARK_TOP } from "@/components/wordmark";

export const alt = "Money Lego: build how your money moves.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 96, background: "#ffffff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <svg width="88" height="88" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="9" fill="#09090b" />
            <path d={MARK_TOP} fill="#fff" />
            <path d={MARK_BASE} fill={MARK_ACCENT} />
          </svg>
          <div style={{ fontSize: 44, fontWeight: 600, letterSpacing: -1.2, color: "#09090b" }}>Money Lego</div>
        </div>
        <div style={{ marginTop: 56, fontSize: 88, fontWeight: 300, letterSpacing: -3, color: "#09090b", lineHeight: 1 }}>Build how your money moves.</div>
        <div style={{ marginTop: 32, fontSize: 32, color: "#52525b" }}>AI-built PayPal workflows you approve before money moves.</div>
      </div>
    ),
    size,
  );
}
