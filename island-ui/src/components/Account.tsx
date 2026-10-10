import { useState } from "react";
import { PencilIcon } from "./icons";
import { PillButton } from "./pickers";

// Account panel — GOlinkup-profile pattern, not a marketing page: one
// identity card (56px photo-or-initial, same as ProfileAvatar), Google
// first then email-behind-a-choice (chooser → email → code steps), one
// Terms line. Signed in: welcome-back header with display name (table wins, Google
// metadata next), editable inline; nameless logins get the complete-account
// form instead of a dead email line.
export function AccountPanel({
  email,
  avatarUrl = null,
  displayName = null,
  firstName = null,
  lastName = null,
  msg,
  busy,
  onGoogle,
  onSendCode,
  onVerify,
  onSaveName,
  hasKey,
  shownCode,
  onRevealCode,
  onHideCode,
  onSaveCode,
}: {
  email: string | null;
  avatarUrl?: string | null;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  msg: string;
  busy: boolean;
  onGoogle: () => void;
  onSendCode: (email: string) => void;
  onVerify: (email: string, code: string) => void;
  onSaveName: (first: string, last: string) => void;
  hasKey: boolean;
  shownCode: string | null;
  onRevealCode: () => void;
  onHideCode: () => void;
  onSaveCode: (code: string) => void;
}) {
  const [addr, setAddr] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [imgDead, setImgDead] = useState(false);
  // Sign-in step lives with the other hooks (never conditional) — the
  // signed-in branch below returns before it renders, order stays stable.
  const [useEmail, setUseEmail] = useState(false);
  const who = (email ?? addr).trim();
  const initial = (who.charAt(0) || "?").toUpperCase();
  const face = avatarUrl && !imgDead ? (
    <img className="profile-avatar" src={avatarUrl} alt="" onError={() => setImgDead(true)} />
  ) : (
    <span className="profile-avatar empty" aria-hidden="true">{email ? initial : "?"}</span>
  );
  if (email) {
    return (
      <AccountCard
        email={email}
        avatarUrl={avatarUrl}
        displayName={displayName}
        firstName={firstName}
        lastName={lastName}
        msg={msg}
        busy={busy}
        onSaveName={onSaveName}
        hasKey={hasKey}
        shownCode={shownCode}
        onRevealCode={onRevealCode}
        onHideCode={onHideCode}
        onSaveCode={onSaveCode}
      />
    );
  }
  // Sign-in steps: chooser (Google / Email) → email entry → code entry.
  // The email field lives behind its own choice — no stray textbox on
  // the front page. Enter still sends, so the fast path stays fast.
  const emailOk = /^\S+@\S+\.\S+$/.test(addr.trim());
  const backToChooser = () => {
    setUseEmail(false);
    setSent(false);
    setCode("");
  };
  const backToEmail = () => {
    setSent(false);
    setCode("");
  };
  const send = () => {
    if (!emailOk) return;
    onSendCode(addr.trim());
    setSent(true);
  };
  if (!useEmail) {
    return (
      <div className="set-row col">
        <span className="set-label">Account</span>
        <div className="profile-head">
          {face}
          <div className="card-detail">One login syncs chats to the phone.</div>
        </div>
        <button className="auth-google" onClick={onGoogle} disabled={busy}>
          {busy ? "…" : "Continue with Google"}
        </button>
        <button className="auth-email" onClick={() => setUseEmail(true)} disabled={busy}>
          Continue with Email
        </button>
        {!!msg && <div className="card-detail">{msg}</div>}
        {busy && <div className="card-detail">working…</div>}
        <p className="ts-terms">
          By continuing you agree to our Terms &amp; Privacy Policy
        </p>
      </div>
    );
  }
  if (!sent) {
    return (
      <div className="set-row col">
        <span className="set-label">Account</span>
        <div className="profile-head">
          {face}
          <div className="card-detail">Sign in with an email code.</div>
        </div>
        <div className="btn-row">
          <input
            className="explore-search"
            placeholder="you@mail.com"
            value={addr}
            disabled={busy}
            onChange={(e) => setAddr(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && emailOk) send();
            }}
          />
          <PillButton onClick={send}>
            Send code
          </PillButton>
        </div>
        <button className="demo-link" onClick={backToChooser}>
          ← All sign-in options
        </button>
        {!!msg && <div className="card-detail">{msg}</div>}
        {busy && <div className="card-detail">working…</div>}
        <p className="ts-terms">
          By continuing you agree to our Terms &amp; Privacy Policy
        </p>
      </div>
    );
  }
  return (
    <div className="set-row col">
      <span className="set-label">Account</span>
      <div className="card-detail">Code sent to {addr.trim()} — check inbox.</div>
      <div className="btn-row">
        <input
          className="explore-search"
          placeholder="123456"
          value={code}
          disabled={busy}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && code.trim()) onVerify(addr.trim(), code.trim());
          }}
        />
        <PillButton onClick={() => code.trim() && onVerify(addr.trim(), code.trim())}>
          Verify
        </PillButton>
      </div>
      <button className="demo-link" onClick={backToEmail}>
        Use a different email
      </button>
      {!!msg && <div className="card-detail">{msg}</div>}
      {busy && <div className="card-detail">working…</div>}
      <p className="ts-terms">
        By continuing you agree to our Terms &amp; Privacy Policy
      </p>
    </div>
  );
}

// Display title-cases the stored name ("twig rapper" → "Twig Rapper").
// Storage keeps what the user typed; only the greeting is polished.
function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

// Signed-in card: welcome-back header (name, not email), avatar, edit
// affordance. Nameless logins (email OTP, no metadata) land on the
// complete-account form — same inputs, no separate page.
function AccountCard({
  email,
  avatarUrl,
  displayName,
  firstName,
  lastName,
  msg,
  busy,
  hasKey,
  shownCode,
  onSaveName,
  onRevealCode,
  onHideCode,
  onSaveCode,
}: {
  email: string;
  avatarUrl: string | null;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  msg: string;
  busy: boolean;
  hasKey: boolean;
  shownCode: string | null;
  onSaveName: (first: string, last: string) => void;
  onRevealCode: () => void;
  onHideCode: () => void;
  onSaveCode: (code: string) => void;
}) {
  const [imgDead, setImgDead] = useState(false);
  const [editing, setEditing] = useState(false);
  const [first, setFirst] = useState(firstName ?? "");
  const [last, setLast] = useState(lastName ?? "");
  const [err, setErr] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [copied, setCopied] = useState(false);
  // The form owns this space until a name exists — no dead email line.
  const showForm = editing || !displayName;
  const openEdit = () => {
    setFirst(firstName ?? "");
    setLast(lastName ?? "");
    setErr("");
    setEditing(true);
  };
  // GOlinkup profile-setup rules, verbatim: required, 2–40 chars, no
  // digits, letters/spaces/hyphens only. First error wins.
  const nameError = (v: string, which: "First" | "Last"): string | null => {
    if (!v) return `Please enter your ${which === "First" ? "first" : "last"} name.`;
    if (v.length < 2) return `${which} name must be at least 2 characters.`;
    if (v.length > 40) return `${which} name cannot exceed 40 characters.`;
    if (/\d/.test(v)) return `${which} name cannot contain numbers.`;
    if (!/^[A-Za-z' -]+$/.test(v)) {
      return `${which} name can only contain letters, spaces, and hyphens.`;
    }
    return null;
  };
  const save = () => {
    const e = nameError(first.trim(), "First") ?? nameError(last.trim(), "Last");
    if (e) {
      setErr(e);
      return;
    }
    setErr("");
    setEditing(false);
    onSaveName(first.trim(), last.trim());
  };
  const initial = ((displayName ?? email).trim().charAt(0) || "?").toUpperCase();
  const copyCode = () => {
    if (!shownCode) return;
    try {
      void navigator.clipboard?.writeText(shownCode).then(
        () => {
          setCopied(true);
          // Command Echo: programmatic copies fire no DOM copy event.
          try {
            document.dispatchEvent(new CustomEvent<string>("steroids:copied", { detail: shownCode }));
          } catch { /* listeners optional */ }
        },
        () => setCopied(false),
      );
    } catch {
      setCopied(false);
    }
  };
  const face = avatarUrl && !imgDead ? (
    <img className="profile-avatar" src={avatarUrl} alt="" onError={() => setImgDead(true)} />
  ) : (
    <span className="profile-avatar empty" aria-hidden="true">{initial}</span>
  );
  return (
    <div className="set-row col">
      <span className="set-label">Account</span>
      <div className="profile-head">
        {face}
        <div>
          <div className="profile-name">
            {displayName ? `Welcome back, ${titleCase(displayName)}` : "Just a few details"}
          </div>
          {!displayName && (
            <div className="card-detail">Help us personalize your experience.</div>
          )}
        </div>
        {!!displayName && !editing && (
          <button className="menu-act" onClick={openEdit} aria-label="Edit name">
            <PencilIcon size={14} />
          </button>
        )}
      </div>
      {showForm && (
        <>
          <div className="btn-row">
            <input
              className="explore-search"
              placeholder="First name"
              value={first}
              disabled={busy}
              onChange={(e) => setFirst(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            />
            <input
              className="explore-search"
              placeholder="Surname"
              value={last}
              disabled={busy}
              onChange={(e) => setLast(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            />
          </div>
          {!!err && <div className="card-detail">{err}</div>}
          <div className="btn-row">
            <PillButton onClick={save}>Continue</PillButton>
            {!!displayName && (
              <button onClick={() => setEditing(false)}>Cancel</button>
            )}
          </div>
        </>
      )}
      {/* Sync code: no key → paste it; key → reveal to enroll a new
          device. Chats never leave this device until a key exists. */}
      {!hasKey ? (
        <>
          <div className="btn-row">
            <input
              className="explore-search"
              placeholder="Sync code"
              value={codeInput}
              disabled={busy}
              onChange={(e) => setCodeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && codeInput.trim()) {
                  onSaveCode(codeInput.trim());
                  setCodeInput("");
                }
              }}
            />
            <PillButton onClick={() => { if (codeInput.trim()) { onSaveCode(codeInput.trim()); setCodeInput(""); } }}>
              Save
            </PillButton>
          </div>
          <div className="card-detail">Paste the sync code from your other device — chats stay on this device until then.</div>
        </>
      ) : shownCode ? (
        <>
          <div className="btn-row">
            <input
              className="explore-search"
              value={shownCode}
              readOnly
              onFocus={(e) => e.target.select()}
            />
            <PillButton onClick={copyCode}>{copied ? "Copied" : "Copy"}</PillButton>
          </div>
          <button className="demo-link" onClick={() => { setCopied(false); onHideCode(); }}>
            Hide
          </button>
        </>
      ) : (
        <button className="demo-link" onClick={onRevealCode}>
          Show sync code
        </button>
      )}
      {!!msg && <div className="card-detail">{msg}</div>}
    </div>
  );
}
