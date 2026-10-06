import { useState } from "react";
import type { AgentSession, Approval, ChatSession, IslandView, Question } from "../store";
import {
  CardIcon, ChatIcon, ExploreIcon, GearIcon, HelpIcon, HistoryIcon, HomeIcon, LensIcon, LogoutIcon, PersonIcon, PlusIcon, TrashIcon, BellIcon,
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

// Avatar menu — the ref's left card: rows only, no header block. Profile
// scrolls to the identity card, Settings lands on the switches (same page,
// different ends — see avatarNav). Subscription + Help render disabled
// honest-soon: the look without a lie.
function AvatarMenu({
  email = null,
  avatarUrl = null,
  view,
  onAvatarNav = () => {},
  onSignOut = () => {},
}: {
  email?: string | null;
  avatarUrl?: string | null;
  view: IslandView;
  onAvatarNav?: (page: "profile" | "explore" | "settings" | "account") => void;
  onSignOut?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [imgDead, setImgDead] = useState(false);
  const dismiss = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  const go = (page: "profile" | "explore" | "settings" | "account") => { setOpen(false); onAvatarNav(page); };
  const initial = (email ?? "").trim().charAt(0).toUpperCase() || "?";
  const face = email && avatarUrl && !imgDead ? (
    <img className="avatar-photo" src={avatarUrl} alt="" onError={() => setImgDead(true)} />
  ) : email ? (
    <span aria-hidden>{initial}</span>
  ) : (
    <PersonIcon size={18} />
  );
  return (
    <div ref={dismiss} className="avatar-wrap">
      <button
        className={email ? "avatar-btn signed" : "avatar-btn"}
        title={email ?? "Account — sign in"}
        aria-label="Account menu"
        onClick={() => setOpen((o) => !o)}
      >
        {face}
      </button>
      {open && (
        <div className="sheet avatar-menu" role="menu" aria-label="Account">
          <button role="menuitem" className={view === "settings" ? "am-row on" : "am-row"} onClick={() => go("profile")}>
            <PersonIcon size={16} /> Profile
          </button>
          <button role="menuitem" className={view === "explore" ? "am-row on" : "am-row"} onClick={() => go("explore")}>
            <ExploreIcon size={16} /> Community
          </button>
          <button role="menuitem" className="am-row" disabled title="Subscriptions aren't here yet">
            <CardIcon size={16} /> Subscription <span className="pro-badge" aria-hidden>⚡PRO</span>
          </button>
          <button role="menuitem" className={view === "settings" ? "am-row on" : "am-row"} onClick={() => go("settings")}>
            <GearIcon size={16} /> Settings
          </button>
          <div className="am-sep" aria-hidden />
          <button role="menuitem" className="am-row" disabled title="Help center isn't here yet">
            <HelpIcon size={16} /> Help center
          </button>
          {email ? (
            <button role="menuitem" className="am-row danger" onClick={() => { setOpen(false); onSignOut(); }}>
              <LogoutIcon size={16} /> Sign out
            </button>
          ) : (
            <button role="menuitem" className="am-row" onClick={() => go("account")}>
              <PersonIcon size={16} /> Sign in
            </button>
          )}
        </div>
      )}
    </div>
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
  email = null,
  avatarUrl = null,
  onAvatarNav = () => {},
  onSignOut = () => {},
  approval = null,
  question = null,
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
  email?: string | null;
  avatarUrl?: string | null;
  onAvatarNav?: (page: "profile" | "explore" | "settings" | "account") => void;
  onSignOut?: () => void;
  approval?: Approval | null;
  question?: Question | null;
}) {
  const tabs = TABS.map((t) => ({
    v: t.view,
    title: t.title,
    Icon: t.Icon,
    badge: t.view === "chat" ? unread : 0,
  }));
  const [histOpen, setHistOpen] = useState(false);
  // Notifications live here now (gear removed — settings rides the avatar
  // menu). Badge = actionable items; sheet rows jump straight to them.
  const [notifOpen, setNotifOpen] = useState(false);
  const notifCount = (approval ? 1 : 0) + (question ? 1 : 0) + unread;
  const closeBoth = () => { setHistOpen(false); setNotifOpen(false); };
  const histDismiss = useDismiss<HTMLDivElement>(histOpen || notifOpen, closeBoth);
  const closeHist = () => setHistOpen(false);
  const goNotif = (v: IslandView) => { onTab(v); closeBoth(); };
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
          active={notifOpen}
          title="Notifications"
          badge={notifCount}
          onClick={() => { setNotifOpen((o) => !o); closeHist(); }}
        >
          <BellIcon bold={notifOpen} size={22} />
        </HeaderIconButton>
        <AvatarMenu email={email} avatarUrl={avatarUrl} view={view} onAvatarNav={onAvatarNav} onSignOut={onSignOut} />
      </div>
      {notifOpen && (
        <div className="hist-panel" role="dialog" aria-label="Notifications">
          <div className="hist-head">
            <span>Notifications</span>
          </div>
          {!approval && !question && unread === 0 && (
            <div className="history-empty">All caught up ✓</div>
          )}
          {approval && (
            <div className="hist-row">
              <button className="hist-title" onClick={() => goNotif("approval")}>
                <b className="kind-tag">decision</b>
                <span className="hist-label">{approval.title}</span>
              </button>
            </div>
          )}
          {question && (
            <div className="hist-row">
              <button className="hist-title" onClick={() => goNotif("question")}>
                <b className="kind-tag">ask</b>
                <span className="hist-label">{question.title}</span>
              </button>
            </div>
          )}
          {unread > 0 && (
            <div className="hist-row">
              <button className="hist-title" onClick={() => goNotif("chat")}>
                <b className="kind-tag">chat</b>
                <span className="hist-label">{unread} unread message{unread === 1 ? "" : "s"}</span>
              </button>
            </div>
          )}
        </div>
      )}
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
