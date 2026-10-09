import { useEffect, useId, useState } from "react";

// MermaidBlock — model-drawn diagrams (ChatGPT-artifact language).
// mermaid rides a lazy chunk (main bundle stays lean); strict security
// level, dark base theme, pop-in via CSS. Any failure falls back to a
// plain code block — a diagram never breaks the reply.
let initd = false;

async function renderSvg(code: string, id: string): Promise<string> {
  const mermaid = (await import("mermaid")).default;
  if (!initd) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      themeVariables: {
        darkMode: true,
        background: "#17181c",
        primaryColor: "#26272c",
        primaryTextColor: "#fff",
        primaryBorderColor: "rgba(255,255,255,.14)",
        lineColor: "rgba(255,255,255,.55)",
        secondaryColor: "#ff4d1c",
        tertiaryColor: "#0b0c0e",
      },
    });
    initd = true;
  }
  const { svg } = await mermaid.render(id, code);
  return svg;
}

export default function MermaidBlock({ code }: { code: string }) {
  const id = `mmd${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [dead, setDead] = useState(false);
  useEffect(() => {
    let alive = true;
    // cap absurd blocks (perf guard); invalid syntax lands in `dead`.
    const src = code.length > 6000 ? code.slice(0, 6000) : code;
    void renderSvg(src, id).then(
      (s) => { if (alive) setSvg(s); },
      () => { if (alive) setDead(true); },
    );
    return () => { alive = false; };
  }, [code, id]);
  // loading or dead: the honest code block (also the mid-stream state).
  if (!svg || dead || !code.trim()) {
    return (
      <pre className="md-pre"><em>mermaid</em><code>{code.replace(/\n$/, "")}</code></pre>
    );
  }
  return <div className="mermaid" dangerouslySetInnerHTML={{ __html: svg }} />;
}
