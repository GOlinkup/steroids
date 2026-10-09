// ActivityOrb: thinking-orbs face for empty/live states.
// The orb always shows *something alive* (breathing at rest), so content
// areas never sit as a black void. Zero config: state in, orb out.
import { ThinkingOrb } from "thinking-orbs";
import type { OrbState, OrbSize } from "thinking-orbs";
import { Component, type JSX, type ReactNode } from "react";
import { orbFor, type IslandActivity } from "./orb_state";

// Canvas can fail where there is no GPU (cloud browsers, blocked WebGL):
// the guard swaps in a pure-CSS blue-blur pulse so the wait still reads.
class OrbGuard extends Component<{ children: ReactNode }, { dead: boolean }> {
  state = { dead: false };
  static getDerivedStateFromError() {
    return { dead: true };
  }
  render() {
    return this.state.dead
      ? <span className="orb-fallback" aria-hidden />
      : this.props.children;
  }
}

export function SafeOrb(props: { state: OrbState; size?: OrbSize }): JSX.Element {
  return (
    <OrbGuard>
      <ThinkingOrb state={props.state} size={props.size ?? 20} />
    </OrbGuard>
  );
}

export function ActivityOrb(props: {
  activity: IslandActivity;
  size?: 64 | 20;
  label?: string;
}): JSX.Element {
  const state = orbFor(props.activity);
  return (
    <div className="activity-orb">
      <OrbGuard>
        <ThinkingOrb state={state} size={props.size ?? 64} />
      </OrbGuard>
      <div className="card-detail">{props.label ?? state}</div>
    </div>
  );
}
