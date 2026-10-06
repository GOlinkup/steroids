import { useState } from "react";
import type { AgentSession, ChatSession, IslandView } from "../store";
import {
  ChatIcon, ExploreIcon, GearIcon, HistoryIcon, HomeIcon, LensIcon, PlusIcon, TrashIcon,
} from "./icons";
import { useDismiss } from "./pickers";

import type { ComponentType } from "react";

interface IconProps {
  size?: number;
  bold?: boolean;
}

const TABS: Array<{ view: IslandView; title: string; Icon: ComponentType<IconProps> }> = [
  { view: "chat", title: "Chat", Icon: ChatIcon },
  { view: "daily", title: "Daily", Icon: HomeIcon },
  { view: "explore", title: "Explore", Icon: ExploreIcon },
  { view: "lens", title: "Lens", Icon: LensIcon },
];

// "3m" / "2h" / "5d" — iOS recents style right-aligned meta.
function ago(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// Reusable OOP base: all header buttons share sizing/alignment.
function NavButton({
  active,
  title,
  onClick,
  children,
  badge,
}: {
  active?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  badge?: number;
}) {
  return (
    <button className={active ? "tab on" : "tab"} title={title} onClick={onClick}>
      {children}
      {!!badge && <span className="tab-badge">{badge > 9 ? "9+" : badge}</span>}
    </button>
  );
}

function HeaderIconButton({
  active,
  title,
  onClick,
  children,
  badge,
}: {
  active?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  badge?: number;
}) {
  return (
    <button className={active ? "icon-btn on" : "icon-btn"} title={title} onClick={onClick}>
      {children}
      {!!badge && <span className="tab-badge">{badge > 9 ? "9+" : badge}</span>}
    </button>
  );
}

// Header navbar — 3 zones: tabs left / middle centered / actions right.
// Grid keeps middle perfectly centered even with uneven sides.
export function Header({
  view,
  unread,
  onTab,
  sessions = [],
  activeSessionId = null,
  onResumeSession,
  onDeleteSession,
  onNewChat,
  middle,
  agentSessions = [],
  onResumeAgent,
  onDeleteAgent,
}: {
  view: IslandView;
  unread: number;
  onTab: (v: IslandView) => void;
  sessions?: ChatSession[];
  activeSessionId?: number | null;
  onResumeSession?: (id: number) => void;
  onDeleteSession?: (id: number) => void;
  onNewChat?: () => void;
  middle?: React.ReactNode;
  agentSessions?: AgentSession[];
  onResumeAgent?: (sid: string, first: string) => void;
  onDeleteAgent?: (sid: string) => void;
}) {
  const tabs = TABS.map((t) => ({
    v: t.view,
    title: t.title,
    Icon: t.Icon,
    badge: t.view === "chat" ? unread : 0,
  }));
  const [histOpen, setHistOpen] = useState(false);
  const histDismiss = useDismiss<HTMLDivElement>(histOpen, () => setHistOpen(false));
  const closeHist = () => setHistOpen(false);
  const hasChats = sessions.length > 0;
  const hasAgents = agentSessions.length > 0;
  return (
    <div ref={histDismiss} className="navbar">
      <div className="tabs">
        {tabs.map(({ v, title, Icon, badge }) => (
          <NavButton key={v} active={view === v} title={title} badge={badge} onClick={() => { onTab(v); closeHist(); }}>
            <Icon bold={view === v} size={22} />
          </NavButton>
        ))}
      </div>
      <div className="nav-middle">{middle}</div>
      <div className="nav-actions">
        <HeaderIconButton
          active={histOpen}
          title="Chat history"
          badge={sessions.length}
          onClick={() => setHistOpen((o) => !o)}
        >
          <HistoryIcon size={22} />
        </HeaderIconButton>
        <HeaderIconButton
          active={view === "settings"}
          title="Settings"
          onClick={() => { onTab("settings"); closeHist(); }}
        >
          <GearIcon bold={view === "settings"} size={22} />
        </HeaderIconButton>
      </div>
      {histOpen && (
        <div className="hist-panel" role="dialog" aria-label="Chat history">
          <div className="hist-head">
            <span>History</span>
            <button className="hist-new" title="Start a new chat" onClick={() => { onNewChat?.(); setHistOpen(false); }}>
              <PlusIcon size={14} />
              <span>New chat</span>
            </button>
          </div>
          {!hasChats && !hasAgents && <div className="history-empty">No previous chats</div>}
          {hasChats && sessions.map((s) => (
            <div key={s.id} className={s.id === activeSessionId ? "hist-row on" : "hist-row"}>
              <button
                className="hist-title"
                title={s.title}
                onClick={() => { onResumeSession?.(s.id); setHistOpen(false); }}
              >
                <span className="hist-label">{s.title}</span>
                <span className="hist-meta">{ago(s.updatedAt)}</span>
              </button>
              {/* live draft (id 0) has no delete — New chat archives it */}
              {s.id !== 0 && (
                <button
                  className="hist-del"
                  title="Delete chat"
                  aria-label={`Delete ${s.title}`}
                  onClick={() => onDeleteSession?.(s.id)}
                >
                  <TrashIcon size={14} />
                </button>
              )}
            </div>
          ))}
          {hasAgents && (
            <>
              <div className="hist-sep" />
              <div className="hist-head">
                <span>Terminal</span>
              </div>
              {agentSessions.slice(0, 8).map((s) => (
                <div key={s.session} className="hist-row">
                  <button
                    className="hist-title"
                    title={`${s.agent} · ${s.session}`}
                    onClick={() => { onResumeAgent?.(s.session, s.first); setHistOpen(false); }}
                  >
                    <b className="kind-tag">{s.agent}</b>
                    <span className="hist-label">{s.first}</span>
                    <span className="hist-meta">{ago(s.ts * 1000)}</span>
                  </button>
                  <button
                    className="hist-del"
                    title="Hide session"
                    aria-label={`Hide ${s.agent} session`}
                    onClick={() => onDeleteAgent?.(s.session)}
                  >
                    <TrashIcon size={14} />
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
