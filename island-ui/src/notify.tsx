// Notification scope copy lives in notify_copy.ts (auditable without a
// DOM): web Notification API covers THIS BROWSER only. This component
// never promises phone mirroring.
import type { JSX } from "react";
import {
  NOTIFY_DENIED_GUIDE,
  NOTIFY_SCOPE_BODY,
  NOTIFY_SCOPE_TITLE,
} from "./notify_copy";

export type NotifyPermission = "default" | "denied" | "granted";

export function NotifyScope(props: {
  supported: boolean;
  permission: NotifyPermission;
  onEnable: () => void;
}): JSX.Element {
  if (!props.supported) {
    return (
      <div className="notify-scope">
        <b>{NOTIFY_SCOPE_TITLE}</b>
        <p>This browser has no Notification API — the island works the same, quietly.</p>
      </div>
    );
  }
  if (props.permission === "granted") {
    return (
      <div className="notify-scope">
        <b>{NOTIFY_SCOPE_TITLE}</b>
        <p>Pings on. {NOTIFY_SCOPE_BODY}</p>
      </div>
    );
  }
  if (props.permission === "denied") {
    return (
      <div className="notify-scope">
        <b>{NOTIFY_SCOPE_TITLE}</b>
        <p>{NOTIFY_DENIED_GUIDE}</p>
      </div>
    );
  }
  return (
    <div className="notify-scope">
      <b>{NOTIFY_SCOPE_TITLE}</b>
      <p>{NOTIFY_SCOPE_BODY}</p>
      <button onClick={props.onEnable}>Enable pings</button>
    </div>
  );
}
