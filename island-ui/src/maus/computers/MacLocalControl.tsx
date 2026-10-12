// Ported from OpenMausBot (Apache-2.0, github.com/milind-soni/OpenMausBot). Modified for Steroids island.
// MacLocalControl plus its recovery buttons (MacCuaRecoveryActions inlined:
// one permission-settings entry per missing grant, plus a relaunch entry).
import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Shield } from "lucide-react";
import { useDesktopCapabilities } from "../shared/desktop-capabilities";
import { macCuaPermissionMessage, missingMacCuaPermissions, type MacCuaPermission } from "./mac-cua-permissions";
import { t } from "../shared/i18n";

const paneName: Record<MacCuaPermission, "computer.mac.permission.screenSettings" | "computer.mac.permission.accessibilitySettings"> = {
  screen: "computer.mac.permission.screenSettings",
  accessibility: "computer.mac.permission.accessibilitySettings",
};

function MacCuaRecoveryActions({ reason }: { reason: string }) {
  const { capabilities, ready } = useDesktopCapabilities();
  const permissions = missingMacCuaPermissions(reason);
  const currentPermissions = missingMacCuaPermissions(capabilities.localComputer.message);
  // `relaunch` exists on newer desktop shells only; the island bridge type
  // does not declare it, so read it through a narrow local cast.
  const relaunchBridge = window.ogb as unknown as { relaunch?: () => Promise<boolean> } | undefined;
  const [error, setError] = useState<string | null>(null);
  if (!permissions.length || permissions.join(",") !== currentPermissions.join(",") ||
      !ready || capabilities.host.platform !== "darwin" ||
      capabilities.localComputer.available !== false || capabilities.localComputer.reasonCode === "remote-server" ||
      typeof window.ogb?.permOpenSettings !== "function") return null;

  const openSettings = async (permission: MacCuaPermission) => {
    try {
      await window.ogb?.permOpenSettings?.(permission);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const relaunch = async () => {
    try {
      await relaunchBridge?.relaunch?.();
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {permissions.map((permission) => (
        <button key={permission} type="button" onClick={() => void openSettings(permission)}
          className="rounded-full border border-current/30 px-2.5 py-1 text-[12.5px] hover:bg-danger/15">
          {t(paneName[permission])}
        </button>
      ))}
      {typeof relaunchBridge?.relaunch === "function" && (
        <button type="button" onClick={() => void relaunch()}
          className="rounded-full border border-current/30 px-2.5 py-1 text-[12.5px] hover:bg-danger/15">
          {t("computer.mac.permission.relaunch")}
        </button>
      )}
      {error && <span role="alert" className="w-full text-[12px]">{error}</span>}
    </div>
  );
}

export function MacLocalControl() {
  const { capabilities } = useDesktopCapabilities();
  const reason = capabilities.localComputer.available ? null : capabilities.localComputer.message;
  const permissionMessage = macCuaPermissionMessage(missingMacCuaPermissions(reason));
  const [pending, setPending] = useState(false);
  const [awaitingGrant, setAwaitingGrant] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const retry = async () => {
    setPending(true);
    setError(null);
    try {
      await window.ogb?.localControl?.retry();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPending(false);
    }
  };

  const openSettings = async () => {
    setError(null);
    setAwaitingGrant(true);
    try {
      await window.ogb?.permOpenSettings?.("accessibility");
      await window.ogb?.permOpenSettings?.("screen");
    } catch (reason) {
      setAwaitingGrant(false);
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  useEffect(() => {
    if (!awaitingGrant) return;
    let used = false;
    const onFocus = () => {
      if (used) return;
      if (document.visibilityState !== "visible") return;
      used = true;
      setAwaitingGrant(false);
      void retry();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [awaitingGrant]);

  if (capabilities.host.platform !== "darwin" || capabilities.localComputer.reasonCode === "remote-server") return null;
  if (capabilities.localComputer.available) return null;

  return (
    <section className="mt-4 rounded-xl border border-warning/25 bg-warning/10 p-4">
      <div className="flex items-start gap-3">
        <Shield size={16} className="mt-0.5 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium text-ink">Allow control of this computer</div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-secondary">
            {permissionMessage ?? t("computer.mac.permission.generic")}
          </p>
          {reason && <details className="mt-2 text-[12px] text-ink-secondary"><summary className="cursor-pointer">{t("computer.mac.permission.driverDetail")}</summary><p className="mt-1 break-words">{reason}</p></details>}
          {error && (
            <div className="mt-2 flex gap-1.5 text-[12px] text-danger">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {permissionMessage && reason && <MacCuaRecoveryActions reason={reason} />}
            {!permissionMessage && (
              <button
                type="button"
                onClick={() => void openSettings()}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white hover:brightness-110 disabled:opacity-50"
              >
                Open System Settings
              </button>
            )}
            <button
              type="button"
              onClick={() => void retry()}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-hairline/50 px-3 py-1.5 text-[12.5px] font-medium text-ink hover:bg-raised disabled:opacity-50"
            >
              {pending && <Loader2 size={13} className="animate-spin" />}
              Retry
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
