import { useEffect, useRef, useState, type ReactNode } from "react";
import { BoltIcon, ChevronDownIcon, ResetIcon } from "./icons";

// PillButton — the ONE pill button: composer pills, home buttons, history
// "+ New" all reuse it. Shape/size live in `.effort-pill` (index.css);
// variants add tone, never geometry.
export function PillButton({
  className = "",
  children,
  ...rest
}: {
  className?: string;
  children?: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`effort-pill${className ? ` ${className}` : ""}`} {...rest}>
      {children}
    </button>
  );
}

// useDismiss — the ONE dropdown closer: wrap toggle + panel in the ref and
// any outside pointerdown or Escape fires onClose. No listeners while closed.
export function useDismiss<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return ref;
}

// Reusable picker OOP base: compact pill (20px), centered content.
// Both dropdowns share sizing/alignment via this shell.
// ponytail: 20px pills below 24px WCAG min — explicit request, bump back if miss-taps rise.
export function PickerShell({
  label,
  open,
  onToggle,
  children,
  sheet,
  kind = "effort",
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children?: ReactNode;
  sheet?: ReactNode;
  kind?: "provider" | "effort";
}) {
  // listeners live only while open, so onToggle here always means close.
  const dismissRef = useDismiss<HTMLDivElement>(open, onToggle);
  return (
    <div ref={dismissRef} className={`effort-wrap kind-${kind}`}>
      <PillButton aria-label={label} onClick={onToggle}>
        {children}
      </PillButton>
      {open && sheet}
    </div>
  );
}

// Display name for a model id (router internals stay off the pills).
export const displayModel = (m: string) => (m === "router-pick" ? "auto" : m);

export const ENGINES: Array<{ id: string; label: string; mark: string; outcome: string; models: string[] }> = [  { id: "auto", label: "auto", mark: "A", outcome: "router picks", models: ["router-pick"] },
  { id: "opencode", label: "opencode", mark: "O", outcome: "everyday", models: ["auto", "gpt", "claude"] },
  { id: "claude", label: "claude", mark: "C", outcome: "complex", models: ["sonnet", "opus", "haiku"] },
  { id: "codex", label: "codex", mark: "X", outcome: "code", models: ["gpt-5", "codex-mini"] },
  { id: "ollama", label: "ollama", mark: "L", outcome: "offline", models: ["local"] },
];

export const EFFORT_TIERS = [  { id: "low", label: "Low", color: "#9ca3af" },
  { id: "med", label: "Med", color: "#9ca3af" },
  { id: "high", label: "High", color: "#3b82f6" },
  { id: "ultra", label: "Ultra", color: "#a855f7" },
] as const;

// Model picker — same rounded pill + sheet as effort, name only.
// Providers with several models expand a nested model submenu.
// Controlled open/onToggle so only one picker is open at a time.
// Steroids is not a model so it is not listed here.
export function ProviderPicker({
  provider,
  model,
  onProvider,
  onModel,
  open,
  onToggle,
}: {
  provider: string;
  model: string;
  onProvider: (id: string) => void;
  onModel: (id: string) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(provider);
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) {
      setExpanded(provider);
      setCursor(Math.max(0, ENGINES.findIndex((e) => e.id === provider)));
    }
  }, [open, provider]);
  const focusProv = (i: number) => {
    listRef.current?.querySelectorAll<HTMLButtonElement>("[data-prov]")[i]?.focus();
  };
  const chooseProv = (i: number, closeOnSingle: boolean) => {
    const e = ENGINES[i];
    if (!e) return;
    onProvider(e.id);
    setExpanded(e.id);
    setCursor(i);
    if (e.models.length < 2 && closeOnSingle) onToggle();
  };
  return (
    <PickerShell
      label="Select model"
      kind="provider"
      open={open}
      onToggle={onToggle}
      sheet={
        <div
          ref={listRef}
          className="sheet effort-sheet pick-list"
          role="listbox"
          aria-label="Model"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              const n = (cursor + 1) % ENGINES.length;
              setCursor(n);
              focusProv(n);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              const n = (cursor - 1 + ENGINES.length) % ENGINES.length;
              setCursor(n);
              focusProv(n);
            } else if (e.key === "ArrowRight" || e.key === "Enter") {
              e.preventDefault();
              chooseProv(cursor, false);
            } else if (e.key === "ArrowLeft") {
              e.preventDefault();
              setExpanded(provider);
            }
          }}
        >
          {ENGINES.map((e, i) => {
            const isCur = e.id === provider;
            const multi = e.models.length > 1;
            return (
              <div key={e.id}>
                <button
                  data-prov
                  role="option"
                  aria-selected={isCur}
                  className={isCur ? "pick-opt on" : "pick-opt"}
                  onClick={() => chooseProv(i, true)}
                >
                  {e.label}{" "}
                  {multi && (
                    <span aria-hidden="true" style={{ display: "inline-flex", transform: "rotate(-90deg)" }}>
                      <ChevronDownIcon size={12} />
                    </span>
                  )}
                </button>
                {expanded === e.id && multi && (
                  <div className="pick-sub" role="group" aria-label={`${e.label} models`}>
                    {e.models.map((m) => (
                      <button
                        key={m}
                        className={m === model && isCur ? "pick-sub-opt on" : "pick-sub-opt"}
                        onClick={() => {
                          if (!isCur) onProvider(e.id);
                          onModel(m);
                          onToggle();
                        }}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      }
    >
      <span className="pill-label">{displayModel(model)}</span>{" "}
      <ChevronDownIcon size={12} />
    </PickerShell>
  );
}

// Effort picker (designspells-333): pill button opens floating sheet.
// Controlled open/onToggle so only one picker is open at a time.
export function EffortPicker({
  value,
  model,
  onChange,
  open,
  onToggle,
}: {
  value: string;
  model: string;
  onChange: (id: string) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const idx = Math.max(0, EFFORT_TIERS.findIndex((t) => t.id === value));
  const tier = EFFORT_TIERS[idx];
  const maxed = idx === EFFORT_TIERS.length - 1;
  const pct = (idx / (EFFORT_TIERS.length - 1)) * 100;
  const pick = (i: number) => {
    const c = Math.max(0, Math.min(EFFORT_TIERS.length - 1, i));
    onChange(EFFORT_TIERS[c].id);
  };
  const fromPointer = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    pick(Math.round(((clientX - r.left) / r.width) * (EFFORT_TIERS.length - 1)));
  };
  return (
    <PickerShell
      label="Select effort"
      open={open}
      onToggle={onToggle}
      sheet={
        <div
          className="sheet effort-sheet"
          role="dialog"
          aria-label="Effort"
        >
          <div className="effort-top">
            <span className={maxed ? "bolt on" : "bolt"} title="effort">
              <BoltIcon size={20} />
            </span>
            <span key={tier.id} className="effort-label" style={{ color: tier.color }}>
              {tier.label}{" "}
              <span aria-hidden="true" style={{ display: "inline-flex", transform: "rotate(-90deg)" }}>
                <ChevronDownIcon size={14} />
              </span>
            </span>
            <button className="effort-reset" title="Reset effort" onClick={() => onChange("med")}>
              <ResetIcon size={16} />
            </button>
          </div>
          <div className="effort-model">{model}</div>
          <div
            ref={trackRef}
            className="effort-track"
            role="slider"
            aria-valuemin={0}
            aria-valuemax={EFFORT_TIERS.length - 1}
            aria-valuenow={idx}
            aria-label="Effort"
            onPointerDown={(e) => {
              (e.target as Element).setPointerCapture?.(e.pointerId);
              fromPointer(e.clientX);
            }}
            onPointerMove={(e) => {
              if (e.buttons > 0) fromPointer(e.clientX);
            }}
          >
            <div
              className="effort-fill"
              style={{ width: `${pct}%` }}
            >
              {maxed && (
                <span className="sparkles on-fill" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              )}
            </div>
            {EFFORT_TIERS.map((t, i) => (
              <i
                key={t.id}
                className={i <= idx ? "detent on" : "detent"}
                style={{ left: `${(i / (EFFORT_TIERS.length - 1)) * 100}%` }}
              />
            ))}
            <span className="effort-thumb" style={{ left: `${pct}%` }} />
          </div>
        </div>
      }
    >
      <span className="pill-label">{tier.label}</span> <ChevronDownIcon size={12} />
    </PickerShell>
  );
}
