// Island profile card: renders the mirror, never mints.
// Empty mirror invites linking; Unlink returns the UI to empty.
import type { JSX } from "react";
import { isEmptyProfile, type IslandProfile } from "./mirror";

export function ProfileMirror(props: {
  profile: IslandProfile;
  onUnlink: () => void;
}): JSX.Element {
  const p = props.profile;
  if (isEmptyProfile(p)) {
    return (
      <div className="card">
        <div className="card-title">Island profile</div>
        <div className="card-detail">
          Link an account to build your island profile.
        </div>
      </div>
    );
  }
  return (
    <div className="card">
      <div className="card-title">
        {p.handle}
        {p.verified && <span title="verified"> ✓</span>}
      </div>
      <div className="card-detail">
        {p.gigs_done} gigs done • {p.gigs_saved} saved
        {p.bio ? ` — ${p.bio}` : ""}
      </div>
      <div className="btn-row">
        <button onClick={props.onUnlink}>Unlink</button>
      </div>
    </div>
  );
}
