import { ImageResponse } from "next/og"

export const runtime = "edge"

export const alt = "Relay — Stop repeating yourself to every AI"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "linear-gradient(145deg, #0a0a0a 0%, #141414 50%, #0a0a0a 100%)",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle radial glow */}
        <div
          style={{
            position: "absolute",
            top: "-200px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "800px",
            height: "600px",
            background: "radial-gradient(ellipse, rgba(255,255,255,0.04) 0%, transparent 70%)",
            display: "flex",
          }}
        />

        {/* Logo mark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "32px",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "14px",
              background: "linear-gradient(135deg, #ffffff 0%, #d4d4d8 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "28px",
              fontWeight: 700,
              color: "#0a0a0a",
            }}
          >
            R
          </div>
          <span
            style={{
              fontSize: "42px",
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: "-0.02em",
            }}
          >
            Relay
          </span>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: "52px",
            fontWeight: 700,
            color: "#ffffff",
            textAlign: "center",
            lineHeight: 1.15,
            maxWidth: "900px",
            letterSpacing: "-0.03em",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <span>Stop repeating yourself</span>
          <span style={{ color: "rgba(255,255,255,0.5)" }}>to every AI</span>
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: "22px",
            color: "rgba(255,255,255,0.45)",
            textAlign: "center",
            marginTop: "24px",
            maxWidth: "700px",
            lineHeight: 1.5,
            display: "flex",
          }}
        >
          Keep a living project brief synced across ChatGPT, Claude, Cursor, and 20+ AI tools
        </div>

        {/* Bottom domain */}
        <div
          style={{
            position: "absolute",
            bottom: "32px",
            fontSize: "18px",
            color: "rgba(255,255,255,0.25)",
            letterSpacing: "0.05em",
            display: "flex",
          }}
        >
          onrelay.app
        </div>

        {/* Border frame */}
        <div
          style={{
            position: "absolute",
            inset: "16px",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "16px",
            display: "flex",
          }}
        />
      </div>
    ),
    { ...size },
  )
}
