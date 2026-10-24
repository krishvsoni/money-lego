import { ImageResponse } from "next/og";

export const alt = "Money Lego: build how your money moves.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BRICKS = ["#e3a21a", "#3c8dbc", "#7a3e8f", "#2c4bd6", "#c2412d"];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 96, background: "#ffffff" }}>
        <div style={{ display: "flex", gap: 12 }}>
          {BRICKS.map((c) => (
            <div key={c} style={{ width: 64, height: 40, borderRadius: 8, background: c }} />
          ))}
        </div>
        <div style={{ marginTop: 56, fontSize: 88, fontWeight: 300, letterSpacing: -3, color: "#09090b", lineHeight: 1 }}>Build how your money moves.</div>
        <div style={{ marginTop: 32, fontSize: 32, color: "#52525b" }}>Payout workflows for Solana teams, routed by MultiHopper.</div>
      </div>
    ),
    size,
  );
}
