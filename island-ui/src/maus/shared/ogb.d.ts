// Ported from OpenMausBot (Apache-2.0, github.com/milind-soni/OpenMausBot). Modified for Steroids island.
// The narrow bridge the Electron preload exposes. Absent in the browser:
// every member is read through optional chaining, so with no bridge (this
// island) all desktop-only paths stay dormant. Trimmed cut of openmaus
// src/types/ogb.d.ts — only the members the Bots/Routines/Computers screens
// touch. Company backups, environments, workspaces, computer sharing,
// cloud-move/lending, companion, updater and package-install channels are
// omitted; re-add them from the original when porting the screens that need
// them.
import type { Bot, ConfigStatus, ModelSelection } from "./store";

declare global {
  type DesktopCapabilities = {
    host: {
      platform: "darwin" | "linux" | "win32" | "other";
      /** The user's home folder, for showing paths as ~/… */
      homeDir?: string;
      label: string;
      session: "x11" | "wayland" | "headless" | "unknown";
      packaged: boolean;
    };
    windowChrome: "mac-inset" | "win-caption" | "native";
    screenPreview: {
      available: boolean;
      interaction: "direct" | "portal-picker" | "none";
      reasonCode?: string;
    };
    dictation: {
      available: boolean;
      engine: "apple-speech" | "none";
      onDevice: boolean;
      reasonCode?: string;
    };
    localComputer: {
      available: boolean;
      support: "supported" | "limited" | "unsupported";
      enabled: boolean;
      status: "disabled" | "checking" | "starting" | "ready" | "error" | "stopped" | "unavailable";
      reasonCode?: string;
      message?: string;
      driverPath?: string;
      driverVersion?: string;
      driverSource?: "bundled" | "environment" | "user-local" | "path";
      session?: "x11" | "wayland" | "headless" | "unknown";
      compositor?: "gnome-mutter";
    };
  };

  /** Whether the desktop is holding this computer awake for routines. */
  interface DesktopRoutineWake {
    /** the toggle */
    keepAwake: boolean;
    /** a power assertion is held right now */
    hold: boolean;
    /** "due" | "running" while held; "off" | "battery" | "idle" | "stopped" otherwise */
    reason: string;
    /** the due routine's time, when the hold is for a due routine */
    at: number | null;
    onBattery: boolean;
  }

  interface DesktopRemoteClientState {
    active: boolean;
    endpoint?: string;
    serverName?: string;
    deviceId?: string;
  }

  /** Minimal account shape: enough for the plan-paid check. The full
   * CloudAccountState lives in openmaus electron/cloud-account.mjs. */
  interface CloudAccountState {
    status: string;
    message?: string;
    lastPlan?: { tier: string };
    entitlement?: unknown;
  }

  interface CloudAccountBridge {
    state(): Promise<CloudAccountState>;
    onState(callback: (state: CloudAccountState) => void): () => void;
    openDashboard(): Promise<void>;
    connectHome(): Promise<void>;
  }

  interface Window {
    ogb?: {
      platform?: string;
      getCapabilities?: () => Promise<DesktopCapabilities>;
      onCapabilitiesChanged?: (cb: (capabilities: DesktopCapabilities) => void) => () => void;
      remoteClient?: {
        active: boolean;
        state(): Promise<DesktopRemoteClientState>;
        pair(endpoint: string, code: string): Promise<DesktopRemoteClientState>;
        disconnect(): Promise<DesktopRemoteClientState>;
      };
      /** Keep this computer awake for scheduled routines; absent on remote
       * server pages and in older desktop builds. */
      routines?: {
        wakeState(): Promise<DesktopRoutineWake>;
        keepAwake(enabled: boolean): Promise<DesktopRoutineWake>;
      };
      cloudAccount?: CloudAccountBridge;
      /** Settings on the person's own Cloud: the plan, read only. */
      cloudPlan?: { manage(): Promise<void> };
      /** Local-shell-only bridge for trusted approval-mode transitions. */
      approvals?: {
        setMode(
          botId: string,
          mode: import("./wire/approval-mode").ApprovalMode,
          options?: { acknowledgeLocalAuto?: boolean; threadId?: string; threadOnly?: boolean; allThreads?: boolean;
            refreshPermissions?: boolean;
            modelSelection?: ModelSelection; updateBotDefault?: boolean },
        ): Promise<Bot>;
      };
      localControl?: {
        status(): Promise<LinuxLocalControlStatus>;
        enable(): Promise<LinuxLocalControlStatus>;
        disable(): Promise<LinuxLocalControlStatus>;
        retry(): Promise<LinuxLocalControlStatus>;
      };
      /** Arms one user-initiated display capture request from this frame. */
      beginScreenPreviewIntent?(): boolean;
      screenFrame?(): Promise<string | null>;
      androidDevice?: {
        status(): Promise<AndroidDeviceStatus>;
        frame(serial: string): Promise<{ serial: string; dataUrl: string }>;
        input(serial: string, payload: AndroidDeviceInput): Promise<void>;
      };
      speechStart?(options?: { endpointMs?: number }): Promise<void>;
      speechStop?(): Promise<void>;
      /** Finish capture and emit the recognizer's final transcript. */
      speechFinish?(): Promise<void>;
      onSpeechTranscript?(
        cb: (line: { partial?: boolean; text?: string; error?: string }) => void,
      ): () => void;
      onSpeechEnd?(cb: (info: { code: number | null; reason?: string }) => void): () => void;
      /** Absolute path of a dropped File. Absent in older builds of the shell. */
      getPathForFile?(file: File): string;
      permStatus?(): Promise<{ mic: string; pageMic?: "allowed" | "refused" }>;
      /** Triggers the macOS microphone prompt; resolves true when granted. */
      permRequestMic?(): Promise<boolean>;
      /** Opens System Settings on a privacy pane: mic|screen|speech|accessibility. */
      permOpenSettings?(pane: "mic" | "screen" | "speech" | "accessibility"): Promise<void>;
      /** Copies an engine install command and opens a blank terminal. */
      openInstallTerminal?(command: string): Promise<boolean>;
      /** Writes plain text to the system clipboard. Absent on older builds. */
      copyText?(text: string): Promise<boolean>;
      /** Opens an http(s) link in the user's default browser. */
      openExternal?(url: string): Promise<boolean>;
      /** The renderer-drawn Windows caption buttons; absent outside the
       * frameless Windows shell. */
      windowControls?: {
        minimize(): Promise<boolean>;
        toggleMaximize(): Promise<boolean>;
        close(): Promise<boolean>;
        state(): Promise<{ maximized: boolean }>;
        onMaximizedChanged(cb: (maximized: boolean) => void): () => void;
      };
      /** Opens a live desktop as a sandboxed window owned by OpenMausBot. */
      desktopViewer?: {
        open(url: string, title: string, contextId: string): Promise<boolean>;
        /** Closes the live-desktop window, but only when it belongs to this bot. */
        close(contextId: string): Promise<boolean>;
        /** The current viewer state, for a panel to initialize from on mount. */
        currentState(): Promise<{ open: boolean; contextId: string | null }>;
        onState(cb: (state: { open: boolean; contextId: string | null }) => void): () => void;
      };
      /** Two Local VM viewers embedded in one app window. */
      desktopWorkspace?: {
        open(input: {
          contextId: string;
          url: string;
          title: string;
          bounds: DesktopWorkspaceBounds;
        }): Promise<DesktopWorkspaceState>;
        layout(items: Array<{
          contextId: string;
          bounds: DesktopWorkspaceBounds;
          visible: boolean;
        }>): Promise<boolean>;
        setInteractive(contextId: string | null): Promise<boolean>;
        close(contextId?: string): Promise<boolean>;
        onState(cb: (state: DesktopWorkspaceState) => void): () => void;
      };
      /** Save a provider credential through Electron's OS-backed store. */
      setCredential?(
        name: "composioApiKey" | "xaiApiKey" | "boxToken" | "opencodeGoApiKey" | "ttsKey" | "fishAudioKey" | "jevApiKey" | "openaiImageApiKey" | "customImageApiKey" | "openaiLiveKey",
        value: string,
      ): Promise<ConfigStatus>;
      /** Points this computer's file manager at a file a bot linked outside
       * its workspace, without opening or reading it. Local app only. */
      revealInFolder?(filePath: string): Promise<"shown" | "missing" | "invalid">;
      /** Asks where to save a bot-created file. Local app only. */
      saveFile?(filePath: string): Promise<string | null>;
      /** Updates the native Dock/taskbar unread indicator. */
      setUnreadCount?(count: number): void;
      /** Receives a chat link opened from outside the app. */
      onChatLink?(cb: (link: string) => void): () => void;
      /** The desktop shell's app-menu Preferences… item was activated. */
      onOpenAppSettings?(cb: (section?: "organization" | "cloud" | "cloud-settings" | "cloud-add" | "cloud-add-howto") => void): () => void;
    };
  }
}

export interface DesktopWorkspaceBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DesktopWorkspaceState {
  contextId: string;
  open: boolean;
  status: "opening" | "ready" | "error" | "closed";
  interactive: boolean;
  code?: "load-failed" | "renderer-gone";
}

export interface LinuxLocalControlStatus {
  enabled: boolean;
  status: "disabled" | "checking" | "starting" | "ready" | "error" | "stopped" | "unavailable";
  reasonCode?: string;
  message?: string;
  driverPath?: string;
  driverVersion?: string;
  driverSource?: "bundled" | "environment" | "user-local" | "path";
  session?: "x11" | "wayland" | "headless" | "unknown";
  compositor?: "gnome-mutter";
  warnings?: Array<{ label: string; status: string; message: string; detail?: string }>;
}

export type AndroidUsbDevice = {
  serial: string;
  state: string;
  connection: "usb";
  model: string;
  product?: string;
  transportId?: string;
};

export type AndroidDeviceStatus = {
  available: boolean;
  reasonCode?: "adb-unavailable" | "adb-failed";
  message?: string;
  devices: AndroidUsbDevice[];
};

export type AndroidDeviceInput =
  | { type: "tap"; x: number; y: number; width: number; height: number }
  | {
      type: "swipe";
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      durationMs: number;
      width: number;
      height: number;
    }
  | { type: "key"; key: string; width?: number; height?: number }
  | { type: "text"; text: string; width?: number; height?: number };
