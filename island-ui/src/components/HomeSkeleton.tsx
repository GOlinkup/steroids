import { Card } from "./Cards";
import { hasCachedTrack } from "../music";

// Home boneyard — shared skeleton so the chunk-load fallback (Island) and
// the data-load branch (Daily work-null) can never drift apart again.
// STATIC bones, no sweep: every bone sits inside the REAL container classes
// at the EXACT size of the asset it stands in for (hero 18px, segbar 22px,
// team tile 26px face, art 24px, transport 32px…), so content paints with zero
// layout shift.

// Work capsule body: mirrors Daily's loaded live-body 1:1 (now, top,
// segbar, 5 steps, tokens). Used by HomeSkeleton + Daily work-null.
export function WorkBones() {
  return (
    <>
      <div className="live-now">
        <i className="dead-dot" />
        <div className="bone" style={{ height: 14, width: "55%" }} />
      </div>
      <div className="live-top">
        <div className="bone" style={{ height: 18, width: 88 }} />
        <div className="bone" style={{ height: 11, flex: 1 }} />
        <div className="bone" style={{ height: 11, width: 40 }} />
      </div>
      <div className="segbar" aria-hidden>
        {Array.from({ length: 20 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
      <div className="live-steps">
        {["01", "02", "03", "04", "05"].map((n) => (
          <div key={n}>
            <span className="ln">{n}</span>
            <span className="st-ic"><span className="st-dot" aria-hidden /></span>
            <span className="bone" style={{ height: 11, flex: 1 }} />
          </div>
        ))}
      </div>
      <div className="live-tokens">
        <span>
          <div className="bone" style={{ height: 11, width: 64 }} />
          <div className="bone" style={{ height: 10, width: 120, marginLeft: "auto" }} />
        </span>
        <div className="segbar flat" aria-hidden>
          {Array.from({ length: 16 }, (_, i) => (
            <i key={i} />
          ))}
        </div>
      </div>
    </>
  );
}

// Music capsule body: mirrors Daily's sugar player 1:1 (art row, seek,
// times, transport). The 32px main + 17px sides match the real buttons.
export function MusicBones() {
  return (
    <>
      <div className="sugar-row">
        <div className="bone" style={{ width: 24, height: 24, borderRadius: 8 }} />
        <span className="sugar-meta">
          <div className="bone" style={{ height: 12, width: "70%" }} />
          <div className="bone" style={{ height: 10, width: "45%", marginTop: 4 }} />
        </span>
        <div className="bone" style={{ width: 24, height: 24, borderRadius: "50%" }} />
      </div>
      <div className="sugar-seek" aria-hidden>
        <div className="bone" style={{ height: 3, borderRadius: 3, flex: 1 }} />
      </div>
      <div className="sugar-times" aria-hidden>
        <div className="bone" style={{ height: 8, width: 28 }} />
        <div className="bone" style={{ height: 8, width: 28 }} />
      </div>
      <div className="sugar-transport" aria-hidden>
        <div className="bone" style={{ width: 17, height: 17, borderRadius: "50%" }} />
        <div className="bone" style={{ width: 32, height: 32, borderRadius: "50%" }} />
        <div className="bone" style={{ width: 17, height: 17, borderRadius: "50%" }} />
      </div>
    </>
  );
}
export function HomeSkeleton({ music = hasCachedTrack() }: { music?: boolean } = {}) {
  return (
    <Card className="daily home-min">
      <div className="hm-grid" aria-busy="true" aria-label="Loading home">
        <div className="live work" style={{ ["--live-accent" as string]: "#fb923c" }}>
          <div className="live-main">
            <span className="live-nicki">
              <span className="bone bone-buddy" aria-hidden />
            </span>
            <div className="live-body">
              <WorkBones />
            </div>
          </div>
        </div>

        <div className="hm-right">
          <div className="hm-team">
            <div className="team-wrap">
              <div className="team-head">
                <b className="team-title">TEAM</b>
                <div className="bone" style={{ height: 24, width: 76, borderRadius: 99, marginLeft: "auto" }} />
              </div>
              <div className="team-grid">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="team-cellwrap">
                    <div className="team-cell" aria-hidden>
                      <span className="bone" style={{ width: 26, height: 26, borderRadius: "50%" }} />
                      <span className="bone" style={{ height: 12, flex: 1 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {music && (
            <div className="live music combo">
              <MusicBones />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
