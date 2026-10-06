// Steroids island FSM — hidden | flex | jacked | pump are gym states.
// Plate snap, no bounce. Logic mirrors island/fsm.js.
// PARITY: keep delay defaults in sync with island/fsm.js —
// tests/test_island_fsm_parity.py fails if they drift.
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
      case "hidden": this.cancelTimers(); this.go("flex"); break;
      case "flex": this.clearFlex(); break;
      case "jacked": this.clearJacked(); break;
      case "pump": this.greet(this.greetHoverCollapseDelay); break;
    }
  }

  mouseLeft() {
    switch (this.state) {
      case "flex": this.hide(this.flexToHiddenDelay); break;
      case "jacked": this.collapse(this.jackedToFlexDelay); break;
      case "pump": this.clearGreet(); this.go("flex"); break;
    }
  }

  click() {
    if (this.state !== "flex") return;
    this.cancelTimers();
    this.go("jacked");
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

  private collapse(s: number) {
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

  cancelTimers() { this.clearFlex(); this.clearJacked(); this.clearGreet(); }

  private go(next: IslandState) {
    if (next === this.state) return;
    const from = this.state;
    this.state = next;
    if (this.onTransition) this.onTransition(from, next);
  }
}
