// SHEET-FREEZE — human order 2026-10-11: top-center positioning + sheet
// geometry locked. No agent edits this file until the human says "unfreeze".
// Enforced by tests/test_sheet_freeze.py. Details: CONTRIBUTING.md.
// Steroids island FSM — hidden | flex | jacked | pump are gym states.
// Plate snap, no bounce.
// Version comes from pyproject.toml — do not stamp here.

export type IslandState = "hidden" | "flex" | "jacked" | "pump";

interface Delays {
  jackedToFlex?: number;
  flexToHidden?: number;
  greetAuto?: number;
  greetHover?: number;
}

export class IslandFSM {
  state: IslandState = "hidden";
  onTransition: ((from: IslandState, to: IslandState) => void) | null = null;
  pinned = false;
  /** ping-island parity: drag-out buddy keeps a floating capsule. */
  detached = false;
  private hoverDwell: ReturnType<typeof setTimeout> | null = null;
  /** Hover must dwell 240ms before flex (kills incidental passes). */

  private jackedToFlexDelay: number;
  private flexToHiddenDelay: number;
  private greetAutoCollapseDelay: number;
  private greetHoverCollapseDelay: number;
  private flexHide: ReturnType<typeof setTimeout> | null = null;
  private jackedCollapse: ReturnType<typeof setTimeout> | null = null;
  private greetCollapse: ReturnType<typeof setTimeout> | null = null;

  constructor(delays: Delays = {}) {
    this.jackedToFlexDelay = delays.jackedToFlex ?? 15;
    this.flexToHiddenDelay = delays.flexToHidden ?? 60;
    this.greetAutoCollapseDelay = delays.greetAuto ?? 0.6;
    this.greetHoverCollapseDelay = delays.greetHover ?? 10;
  }

  launch() { this.cancelTimers(); this.go("pump"); }

  mouseEntered() {
    switch (this.state) {
      case "hidden":
        // dwell-gated: only expand after 240ms hover (ping-island 0.24s)
        if (this.hoverDwell == null) {
          this.hoverDwell = setTimeout(() => {
            this.hoverDwell = null;
            if (this.state === "hidden") { this.cancelTimers(); this.go("flex"); }
          }, 240);
        }
        break;
      case "flex": this.clearFlex(); break;
      case "jacked": this.clearJacked(); break;
      case "pump": this.greet(this.greetHoverCollapseDelay); break;
    }
  }

  mouseLeft() {
    if (this.hoverDwell != null) { clearTimeout(this.hoverDwell); this.hoverDwell = null; }
    switch (this.state) {
      case "flex": this.hide(this.flexToHiddenDelay); break;
      case "jacked": this.collapseIn(this.jackedToFlexDelay); break;
      case "pump": this.clearGreet(); this.go("flex"); break;
    }
  }

  click() {
    // ponytail: accept hidden (coucou parity) — after an alert the island can
    // be on screen while the FSM never saw mouse-enter; click must still open.
    if (this.state !== "flex" && this.state !== "hidden") return;
    this.cancelTimers();
    this.go("jacked");
  }

  // ponytail: external sync (coucou IslandStateMachine parity) — app hid /
  // expanded / folded the island itself; mirror it so hover/click keep working.
  hiddenExternally() {
    if (this.state !== "flex") return;
    this.cancelTimers();
    this.state = "hidden";
  }

  openedExternally() {
    this.cancelTimers();
    if (this.state === "jacked" || this.state === "pump") return;
    this.state = "jacked";
  }

  collapse() {
    if (this.state !== "jacked" && this.state !== "pump") return;
    this.cancelTimers();
    this.go("flex");
  }

  greetComplete() {
    if (this.state !== "pump") return;
    if (this.greetCollapse == null) this.greet(this.greetAutoCollapseDelay);
  }

  reveal() {
    if (this.state !== "hidden") return;
    this.cancelTimers();
    this.go("flex");
    this.hide(this.flexToHiddenDelay);
  }

  forceJacked() { this.cancelTimers(); this.go("jacked"); }
  forceFlex() { this.cancelTimers(); this.go("flex"); }
  forceHidden() { this.cancelTimers(); this.go("hidden"); }

  setPinned(p: boolean) { this.pinned = p; }

  setAutoClose(seconds: number) {
    this.flexToHiddenDelay = seconds;
    this.jackedToFlexDelay = seconds;
  }

  private hide(s: number) {
    this.clearFlex();
    this.flexHide = setTimeout(() => {
      this.flexHide = null;
      if (this.state === "flex") this.go("hidden");
    }, s * 1000);
  }

  private collapseIn(s: number) {
    this.clearJacked();
    if (this.pinned) return;
    this.jackedCollapse = setTimeout(() => {
      this.jackedCollapse = null;
      if (this.state === "jacked") this.go("flex");
    }, s * 1000);
  }

  private greet(s: number) {
    this.clearGreet();
    this.greetCollapse = setTimeout(() => {
      this.greetCollapse = null;
      if (this.state === "pump") this.go("flex");
    }, s * 1000);
  }

  private clearFlex() { if (this.flexHide != null) clearTimeout(this.flexHide); this.flexHide = null; }
  private clearJacked() { if (this.jackedCollapse != null) clearTimeout(this.jackedCollapse); this.jackedCollapse = null; }
  private clearGreet() { if (this.greetCollapse != null) clearTimeout(this.greetCollapse); this.greetCollapse = null; }

  cancelTimers() { this.clearFlex(); this.clearJacked(); this.clearGreet(); if (this.hoverDwell != null) { clearTimeout(this.hoverDwell); this.hoverDwell = null; } }

  detach() { this.cancelTimers(); this.detached = true; this.go("flex"); }
  redock() { this.detached = false; this.go("hidden"); }

  private go(next: IslandState) {
    if (next === this.state) return;
    const from = this.state;
    this.state = next;
    if (this.onTransition) this.onTransition(from, next);
  }
}
