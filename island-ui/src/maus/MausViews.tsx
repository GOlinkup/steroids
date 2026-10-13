// Steroids island — absorbed Maus screens (one app, no iframe).
// Owns one Maus StoreProvider so Bots/Computers/Routines share one
// backend session; remounts when the sheet collapses (SSE reconnects).
import { useStore, StoreProvider } from "./shared/store";
import { TeamMapPage } from "./bots/TeamMapPage";
import { ComputerPanel } from "./computers/ComputerPanel";
import { RoutinesPage } from "./routines/RoutineCalendarPage";
import { Sidebar } from "./chat/Sidebar";
import { ChatRoom } from "./chat/ChatRoom";
import type { IslandView } from "../store";

export type MausNavView = "maus" | "bots" | "computer" | "routines" | "chat";

function ComputerSlot() {
  const { state } = useStore();
  const bot = state.bots.find((b) => b.id === state.selectedId) ?? state.bots[0];
  if (!bot) {
    return (
      <div className="card">
        <div className="card-title">No computers yet</div>
        <div className="card-detail">Add a bot on the Bots view first.</div>
      </div>
    );
  }
  return <ComputerPanel bot={bot} />;
}

function Active({ view, onNavigate }: { view: MausNavView; onNavigate: (v: IslandView) => void }) {
  const { dispatch } = useStore();
  if (view === "chat") {
    return (
      <div className="flex h-full min-h-0 flex-1">
        <Sidebar view="chat" onNavigate={onNavigate} />
        <ChatRoom />
      </div>
    );
  }
  if (view === "computer") return <ComputerSlot />;
  if (view === "routines") {
    return (
      <RoutinesPage
        onBack={() => onNavigate("bots")}
        onOpenRoom={(id: string) => {
          dispatch({ type: "select", id });
          onNavigate("chat");
        }}
      />
    );
  }
  // maus home = team (bots). Island chat stays our own chat view.
  return <TeamMapPage />;
}

export function MausViews({ view, onNavigate }: { view: MausNavView; onNavigate: (v: IslandView) => void }) {
  return (
    <StoreProvider>
      <Active view={view} onNavigate={onNavigate} />
    </StoreProvider>
  );
}
