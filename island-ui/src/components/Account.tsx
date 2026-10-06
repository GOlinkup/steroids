import { useState } from "react";
import { PillButton } from "./pickers";

// Account panel — GOlinkup-profile pattern, not a marketing page: one
// identity card (56px photo-or-initial, same as ProfileAvatar), Google
// first then email code, one Terms line. No tabs, no hero, no second CTA.
export function AccountPanel({
  email,
  avatarUrl = null,
  msg,
  busy,
  onGoogle,
  onSendCode,
  onVerify,
  onSignOut,
  onSyncNow,
}: {
  email: string | null;
  avatarUrl?: string | null;
  msg: string;
  busy: boolean;
  onGoogle: () => void;
  onSendCode: (email: string) => void;
  onVerify: (email: string, code: string) => void;
  onSignOut: () => void;
  onSyncNow: () => void;
}) {
  const [addr, setAddr] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [imgDead, setImgDead] = useState(false);
  const who = (email ?? addr).trim();
  const initial = (who.charAt(0) || "?").toUpperCase();
  const face = avatarUrl && !imgDead ? (
    <img className="profile-avatar" src={avatarUrl} alt="" onError={() => setImgDead(true)} />
  ) : (
    <span className="profile-avatar empty" aria-hidden="true">{email ? initial : "?"}</span>
  );
  if (email) {
    return (
      <div className="set-row col">
        <span className="set-label">Account</span>
        <div className="profile-head">
          {face}
          <div className="card-detail">signed in as {email}</div>
        </div>
        <div className="btn-row">
          <PillButton onClick={onSyncNow}>Sync now</PillButton>
          <button onClick={onSignOut}>Sign out</button>
        </div>
        {!!msg && <div className="card-detail">{msg}</div>}
      </div>
    );
  }
  // Sign-in, one column: Google one-tap, or a code by email. Everything
  // visible, nothing tabbed away.
  const emailOk = /^\S+@\S+\.\S+$/.test(addr.trim());
  const back = () => {
    setSent(false);
    setCode("");
  };
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
      {!sent ? (
        <div className="btn-row">
          <input
            className="explore-search"
            placeholder="you@mail.com"
            value={addr}
            disabled={busy}
            onChange={(e) => setAddr(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && emailOk) {
                onSendCode(addr.trim());
                setSent(true);
              }
            }}
          />
          <PillButton onClick={() => { if (emailOk) { onSendCode(addr.trim()); setSent(true); } }}>
            Send code
          </PillButton>
        </div>
      ) : (
        <>
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
          <button className="demo-link" onClick={back}>
            Use a different email
          </button>
        </>
      )}
      {!!msg && <div className="card-detail">{msg}</div>}
      {busy && <div className="card-detail">working…</div>}
      <p className="ts-terms">
        By continuing you agree to our Terms &amp; Privacy Policy
      </p>
    </div>
  );
}
