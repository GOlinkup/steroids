// SafeOrb: thinking-orbs face for the live turn bubble.
// The orb always shows *something alive* (breathing at rest), so content
// areas never sit as a black void. Zero config: state in, orb out.
import { ThinkingOrb } from "thinking-orbs";
import type { OrbState, OrbSize } from "thinking-orbs";
import { Component, type JSX, type ReactNode } from "react";

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

