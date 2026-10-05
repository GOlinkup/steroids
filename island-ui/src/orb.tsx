// ActivityOrb: thinking-orbs face for empty/live states.
// The orb always shows *something alive* (breathing at rest), so content
// areas never sit as a black void. Zero config: state in, orb out.
import { ThinkingOrb } from "thinking-orbs";
import type { JSX } from "react";
import { orbFor, type IslandActivity } from "./orb_state";

export function ActivityOrb(props: {
  activity: IslandActivity;
  size?: 64 | 20;
  label?: string;
}): JSX.Element {
  const state = orbFor(props.activity);
  return (
    <div className="activity-orb">
      <ThinkingOrb state={state} size={props.size ?? 64} />
      <div className="card-detail">{props.label ?? state}</div>
    </div>
  );
}
