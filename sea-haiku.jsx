import React from "react";

// Structural concept: Single Object, No Chrome — haiku is a single statement piece, no nav/footer.
// Palette: #0D1B1E ink ground, #F5F0EB paper, single contrast #C8D8D3 sea-foam.
// Type: Fraunces (display serif) + IBM Plex Mono (micro-labels).

export default function SeaHaiku() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0D1B1E",
        color: "#F5F0EB",
        display: "flex",
        alignItems: "center",
        padding: "clamp(2rem, 8vw, 8rem)",
        fontFamily: "'Fraunces', Georgia, serif",
      }}
    >
      <div style={{ maxWidth: "900px", width: "100%" }}>
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "11px",
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "#C8D8D3",
            marginBottom: "2.5rem",
          }}
        >
          N° 01 — Sea Study
        </div>
        <div style={{ lineHeight: 1.05, letterSpacing: "-0.03em" }}>
          <div style={{ fontSize: "clamp(2.5rem, 8vw, 6.5rem)", fontWeight: 300 }}>
            tide pulls back slowly
          </div>
          <div
            style={{
              fontSize: "clamp(2.5rem, 8vw, 6.5rem)",
              fontWeight: 600,
              fontStyle: "italic",
              marginLeft: "clamp(2rem, 10vw, 9rem)",
              color: "#C8D8D3",
            }}
          >
            moon writes on soft black water
          </div>
          <div style={{ fontSize: "clamp(2.5rem, 8vw, 6.5rem)", fontWeight: 300 }}>
            shore keeps what is left
          </div>
        </div>
        <div
          style={{
            marginTop: "3rem",
            height: "1px",
            background: "#C8D8D3",
            opacity: 0.3,
            width: "100%",
          }}
        />
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "11px",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            opacity: 0.6,
            marginTop: "1rem",
          }}
        >
          low tide — 04:47 AM
        </div>
      </div>
    </div>
  );
}
