// Gig list: native rows + seed rows with attribution, money lines, and
// the seed-delay disclosure. Presentational: rows in via props (the
// bridge GET /gigs ranks native-first); taps land through row handlers.
import type { JSX } from "react";
import { moneyLine, type GigListing } from "./money";

export function GigList(props: {
  gigs: GigListing[];
  seedNotice: string | null;
  onPick?: (id: string) => void;
}): JSX.Element {
  if (props.gigs.length === 0) {
    return (
      <div className="card">
        <div className="card-title">Gigs you can land today</div>
        <div className="card-detail">No gigs right now — native jobs table is empty and the Remotive seed didn&apos;t land. Check the bridge /gigs, or seed the jobs table.</div>
      </div>
    );
  }
  const seeded = props.gigs.some((g) => g.origin === "remotiveSeed");
  return (
    <div className="card">
      <div className="card-title">Gigs you can land today</div>
      {props.gigs.map((g) => (
        <button
          key={g.id}
          className="gig-row"
          onClick={() => props.onPick?.(g.id)}
        >
          <span>
            <b>{g.title}</b>
            {[g.attribution, g.location]
              .filter((s) => s && s.length > 0)
              .join(" • ")}
          </span>
          <em>{moneyLine(g)}</em>
        </button>
      ))}
      {seeded && props.seedNotice && (
        <div className="card-detail">{props.seedNotice}</div>
      )}
    </div>
  );
}
