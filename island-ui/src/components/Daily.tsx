import { useEffect, useState } from "react";
import { Card } from "./Cards";
import { MusicIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon } from "./icons";
import { fetchNowPlaying, fmtClock, mergeTrack, pushHistory, resolveArt, seekFrac, sendPlayerCmd, trackKey, type HistTrack, type NowPlaying } from "../music";

// React daily — work + tokens + day loop + music, zero keys anywhere.
// All data rides the island bridge itself (same-origin /api/daily/*):
// no second daemon to keep alive, offline-safe localhost.
const API = window.location.origin;

interface DayEvent { type: string; label: string; at: number }
interface Work {
  state: string;
  activity: string;
  current: string;
  asks: number;
  done: number;
  left: number;
  pct: number;
  files: string[];
  added: number;
  removed: number;
  steps: { label: string; status: string }[];
}
interface UsageToday { in: number; out: number; cached: number; cost: number; sessions: number }
interface Usage {
  provider: string;
  model: string;
  today: UsageToday;
  current: { title: string; model: string; in: number; out: number; cost: number };
}

// 358066 -> 358k, 14582567 -> 14.6M. Tokens only, never money-math.
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return `${n}`;
}

// Local player (YouTube watch-page scaled to a card): 16:9 thumb with
// duration badge, title + channel row, red progress, transport, then an
// Up-Next rail of recent tracks on this PC. Paused renders frozen — same
// track re-polled while paused keeps its ref (mergeTrack) so the home card
// never churns when nothing is audible. Up-Next rows are display-only:
// MPRIS can't remote-play history, so no fake play buttons.
function LocalPlayer({
  track,
  upNext,
  onCmd,
}: {
  track: NowPlaying;
  upNext: HistTrack[];
  onCmd: (action: "play-pause" | "next" | "previous" | "seek", position?: number) => void;
}) {
  const frac = seekFrac(track);
  // MPRIS position can briefly overshoot a just-changed track: clamp the
  // readout so it never prints 3:37 / 3:22.
  const pos =
    track.pos !== null && track.len !== null
      ? Math.min(track.pos, track.len)
      : track.pos;
  const art = resolveArt(track.art, window.location.origin);
  return (
    <>
      {/* YT-Music compact: 48px thumb + meta + inline transport. */}
      <div className="ytm-row">
        {art ? (
          <img src={art} alt="" className="ytm-thumb" loading="lazy" />
        ) : (
          <span className="ytm-thumb empty" aria-hidden>
            <MusicIcon size={20} />
          </span>
        )}
        <span className="ytm-meta">
          <b>{track.title}</b>
          {!!track.artist && <em>{track.artist}</em>}
        </span>
        <span className="ytm-transport">
          <button aria-label="Previous track" onClick={() => onCmd("previous")}>
            <PrevIcon size={16} />
          </button>
          <button className="primary" aria-label={track.playing ? "Pause" : "Play"} onClick={() => onCmd("play-pause")}>
            {track.playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
          </button>
          <button aria-label="Next track" onClick={() => onCmd("next")}>
            <NextIcon size={16} />
          </button>
        </span>
      </div>
      <div
        className="music-seek yt-seek"
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={track.len ?? 0}
        aria-valuenow={pos ?? 0}
        onClick={(e) => {
          if (frac === null || track.len === null) return;
          const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          const f = Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width)));
          onCmd("seek", f * track.len);
        }}
      >
        <i className="music-fill" style={{ width: `${Math.round((frac ?? 0) * 100)}%` }} />
      </div>
      <div className="music-times">
        <span>{fmtClock(pos)}</span>
        {!!track.player && <span>via {track.player}</span>}
        <span>{fmtClock(track.len)}</span>
      </div>
      {upNext.length > 0 && (
        <div className="yt-upnext">
          <div className="yt-upnext-head">Up next · recent on this PC</div>
          {upNext.map((h) => (
            <div className="yt-row" key={h.key}>
              {resolveArt(h.art, window.location.origin) ? (
                <img src={resolveArt(h.art, window.location.origin) ?? ""} alt="" loading="lazy" />
              ) : (
                <span className="yt-row-thumb" aria-hidden>
                  <MusicIcon size={18} />
                </span>
              )}
              <span className="yt-row-meta">
                <b>{h.title}</b>
                {!!h.artist && <em>{h.artist}</em>}
              </span>
              {h.len !== null && <span className="yt-row-dur">{fmtClock(h.len)}</span>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

const HIST_KEY = "steroids-track-history";

function readHistory(): HistTrack[] {
  try {
    const raw = localStorage.getItem(HIST_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((h): h is HistTrack => !!h && typeof h.title === "string" && typeof h.key === "string")
      .slice(0, 8);
  } catch {
    return [];
  }
}

export function DailyView() {
  const [work, setWork] = useState<Work | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [events, setEvents] = useState<DayEvent[] | null>(null);

  useEffect(() => {
    fetch(`${API}/api/daily/today`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setEvents(d.events ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const pullWork = () => {
      fetch(`${API}/api/daily/work`)
        .then((r) => (r.ok ? r.json() : null))
        .then((w) => w && setWork(w))
        .catch(() => {});
      fetch(`${API}/api/daily/usage`)
        .then((r) => (r.ok ? r.json() : null))
        .then((u) => u && setUsage(u))
        .catch(() => {});
    };
    pullWork();
    const timer = setInterval(pullWork, 10000);
    return () => clearInterval(timer);
  }, []);

  // Local playback (bridge /nowplaying, playerctl/MPRIS): what's actually
  // playing on this PC right now. Same 3s loop as lens shots, but idle
  // polls are no-ops: mergeTrack keeps the ref when a paused track re-polls
  // identically, so the home card never churns when nothing is audible.
  const [local, setLocal] = useState<NowPlaying | null>(null);
  const [hasCtl, setHasCtl] = useState<boolean | null>(null);
  const [upNext, setUpNext] = useState<HistTrack[]>(readHistory);
  // Up-Next rail insert, straight from a fetch result (no render effect —
  // sync setState in an effect double-renders every track change).
  const notePlayed = (t: NowPlaying) => {
    if (!t.playing || !t.title) return;
    setUpNext((prev) => {
      const next = pushHistory(prev, t);
      if (next.length === prev.length && next[0]?.key === prev[0]?.key) return prev;
      try {
        localStorage.setItem(HIST_KEY, JSON.stringify(next));
      } catch {
        // private mode / quota — rail still works for the session
      }
      return next;
    });
  };
  useEffect(() => {
    let dead = false;
    const pull = () => {
      fetchNowPlaying(window.location.origin, fetch)
        .then((t) => {
          if (dead) return;
          setHasCtl(t.hasPlayerctl);
          setLocal((prev) => mergeTrack(prev, t));
          notePlayed(t);
        })
        .catch(() => {});
    };
    pull();
    const timer = setInterval(pull, 3000);
    return () => {
      dead = true;
      clearInterval(timer);
    };
  }, []);
  const cmd = (action: "play-pause" | "next" | "previous" | "seek", position?: number) => {
    const refresh = () => {
      fetchNowPlaying(window.location.origin, fetch)
        .then((t) => {
          setHasCtl(t.hasPlayerctl);
          setLocal((prev) => mergeTrack(prev, t));
          notePlayed(t);
        })
        .catch(() => {});
    };
    void sendPlayerCmd(window.location.origin, fetch, action, {
      player: local?.player,
      position,
    })
      .then(refresh)
      .catch(() => {});
    // Player metadata lags the command (next/previous especially): re-pull
    // twice so a track switch paints within ~2s instead of only surfacing
    // on the next play-state flip or 3s loop tick.
    window.setTimeout(refresh, 800);
    window.setTimeout(refresh, 2000);
  };

  return (
    <Card className="daily bento">
      {/* Work: what we're on, where it stands, %/left — off the ledger. */}
      <div className="card-row bento-hero">
        <div className="work-top">
          <div className="card-title">Now working 🔨</div>
          {work !== null && work.asks > 0 && (
            <div className="work-pct">{work.pct}%</div>
          )}
        </div>
        {work === null ? (
          <div className="card-detail">Checking work…</div>
        ) : work.asks === 0 ? (
          <div className="card-detail">
            Quiet day — no asks logged yet. No filler, just calm.
          </div>
        ) : (
          <>
            <div className="work-line">
              <i
                className={
                  work.state === "working" || work.state === "thinking"
                    ? "live-dot"
                    : "dead-dot"
                }
              />
              <b>{work.state}</b>
              {!!work.activity && <span>{work.activity}</span>}
            </div>
            {!!work.current && <div className="work-ask">“{work.current}”</div>}
            {work.steps.length > 0 && (
              <div className="work-steps">
                {work.steps.map((s, i) => (
                  <div key={i} className={`work-step ${s.status}`}>
                    {s.status === "active" ? (
                      <i className="live-dot" />
                    ) : s.status === "error" ? (
                      <b className="tick">✕</b>
                    ) : s.status === "pending" ? (
                      <i className="dead-dot" />
                    ) : (
                      <b className="tick">✓</b>
                    )}
                    <span>{s.label}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="music-seek" aria-label={`${work.pct}% done`}>
              <i className="music-fill" style={{ width: `${work.pct}%` }} />
            </div>
            <div className="card-detail">
              {work.done}/{work.asks} done · {work.left} left · {work.pct}%
              {(work.added > 0 || work.removed > 0) &&
                ` · +${work.added} −${work.removed}`}
            </div>
            {work.files.length > 0 && (
              <div className="card-detail">{work.files.join(" · ")}</div>
            )}
          </>
        )}
      </div>

      {/* Tokens: provider in use, today's burn + current session. */}
      <div className="card-row">
        <div className="card-title">Tokens ⚡</div>
        {usage === null ? (
          <div className="card-detail">Checking usage…</div>
        ) : usage.today.sessions === 0 ? (
          <div className="card-detail">
            No sessions on {usage.provider || "opencode"} yet today.
          </div>
        ) : (
          <>
            <div className="work-line">
              <i className="live-dot" />
              <b>{usage.model || usage.provider}</b>
              {!!usage.current.title && (
                <span>{usage.current.title}</span>
              )}
            </div>
            <div className="tok-stats">
              <div className="tok-stat">
                <b>{fmtTokens(usage.today.in)}</b>
                <span>in</span>
              </div>
              <div className="tok-stat">
                <b>{fmtTokens(usage.today.out)}</b>
                <span>out</span>
              </div>
              <div className="tok-stat">
                <b>{usage.today.sessions}</b>
                <span>session{usage.today.sessions === 1 ? "" : "s"}</span>
              </div>
            </div>
            <div className="card-detail">
              today
              {usage.today.cached > 0 &&
                ` · ${fmtTokens(usage.today.cached)} cached`}
              {usage.today.cost > 0 && ` · $${usage.today.cost.toFixed(2)}`}
            </div>
          </>
        )}
      </div>

      {/* Day-close: exactly what moved today, or an honest empty. */}
      <div className="card-row">
        <div className="card-title">Today moved</div>
        {events === null ? (
          <div className="card-detail">Checking today…</div>
        ) : events.length === 0 ? (
          <div className="card-detail">
            Quiet day — nothing logged yet. No filler, just calm.
          </div>
        ) : (
          <ul className="daily-list">
            {events.map((e, i) => (
              <li key={i}>{e.label}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Music: confirmed playback only — the whole row stays out
          until the first real reading lands, and an empty reading
          stays a one-liner. No placeholder content, ever. */}
      {(local?.title || hasCtl !== null) && (
        <div className="card-row">
          <div className="card-title">Now playing 🎵</div>
          {local?.title ? (
            <LocalPlayer
              track={local}
              upNext={upNext.filter((h) => h.key !== trackKey(local))}
              onCmd={cmd}
            />
          ) : (
            <div className="card-detail">
              {hasCtl === false
                ? "No player detected on this PC."
                : "Nothing playing."}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
