import { useState } from "react";
import { PillButton } from "./pickers";

// Account panel — login lives in Settings so any user can sync history to
// the phone. Same Supabase project + user pool as GOlinkup (email OTP).
// Offline-first: everything works logged out; login only mirrors chats.
export function AccountPanel({
  email,
  msg,
  busy,
  onSendCode,
  onVerify,
  onSignOut,
  onSyncNow,
}: {
  email: string | null;
  msg: string;
  busy: boolean;
  onSendCode: (email: string) => void;
  onVerify: (email: string, code: string) => void;
  onSignOut: () => void;
  onSyncNow: () => void;
}) {
  const [addr, setAddr] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  if (email) {
    return (
      <div className="set-row col">
        <span className="set-label">Account</span>
        <div className="card-detail">signed in as {email}</div>
        <div className="btn-row">
          <PillButton onClick={onSyncNow}>Sync now</PillButton>
          <button onClick={onSignOut}>Sign out</button>
        </div>
        {!!msg && <div className="card-detail">{msg}</div>}
      </div>
    );
  }
  // Sign-in form (talkstream login pattern, heater video lives page-level
  // in Settings now). Email OTP only.
  const emailOk = /^\S+@\S+\.\S+$/.test(addr.trim());
  const back = () => {
    setSent(false);
    setCode("");
  };
  return (
    <div className="set-row col">
      <span className="set-label">Account — sign in</span>
      <div className="card-detail">A code by email, your history follows you.</div>
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
    </div>
  );
}
