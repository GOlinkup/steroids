import { useState } from "react";
import type { ChatSession, IslandView } from "../store";
import {
  ChatIcon, ExploreIcon, GearIcon, HistoryIcon, HomeIcon, LensIcon, XIcon,
} from "./icons";

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
}) {
  const tabs = TABS.map((t) => ({
    v: t.view,
    title: t.title,
    Icon: t.Icon,
    badge: t.view === "chat" ? unread : 0,
  }));
  const [histOpen, setHistOpen] = useState(false);
  return (
    <div className="navbar">
      <div className="tabs">
        {tabs.map(({ v, title, Icon, badge }) => (
          <NavButton key={v} active={view === v} title={title} badge={badge} onClick={() => onTab(v)}>
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
          <HistoryIcon size={20} />
        </HeaderIconButton>
        <HeaderIconButton
          active={view === "settings"}
          title="Settings"
          onClick={() => onTab("settings")}
        >
          <GearIcon bold={view === "settings"} size={22} />
        </HeaderIconButton>
      </div>
      {histOpen && (
        <div className="hist-panel" role="dialog" aria-label="Chat history">
          <div className="hist-head">
            <span>History</span>
            <button className="hist-new" onClick={() => { onNewChat?.(); setHistOpen(false); }}>
              + New
            </button>
          </div>
          {sessions.length === 0 && <div className="history-empty">No previous chats</div>}
          {sessions.map((s) => (
            <div key={s.id} className={s.id === activeSessionId ? "hist-row on" : "hist-row"}>
              <button
                className="hist-title"
                title={s.title}
                onClick={() => { onResumeSession?.(s.id); setHistOpen(false); }}
              >
                {s.title}
              </button>
              <button
                className="hist-del"
                title="Delete chat"
                aria-label={`Delete ${s.title}`}
                onClick={() => onDeleteSession?.(s.id)}
              >
                <XIcon size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
