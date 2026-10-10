import { useEffect, useRef, useState } from "react";
import { Card } from "./Cards";
import { NextIcon, PauseIcon, PlayIcon, PrevIcon } from "./icons";
import { cacheTrack, fetchNowPlaying, fmtClock, loadCachedTrack, mergeTrack, resolveArt, sendPlayerCmd, trackKey, type NowPlaying } from "../music";
import Mascot, { type MascotMood } from "./Mascot";
import { TeamGrid, MemberDetail, SegBar, StepsList, slotSession, useTeam, useSessionProgress, type AgentMini, type Lens } from "./TeamGrid";
import { MusicBones, WorkBones } from "./HomeSkeleton";

// React daily — work + tokens + day loop + music, zero keys anywhere.
// All data rides the island bridge itself (same-origin /api/daily/*):
// no second daemon to keep alive, offline-safe localhost.
const API = window.location.origin;

interface WorkDoc { name: string; snippet: string }
interface WorkProject { cwd: string; name: string; docs: WorkDoc[] }
interface Work {
  state: string;
  activity: string;
  current: string;
  asks: number;
  done: number;
  left: number;
  pct: number;
  files: string[];
  file?: string;
  lens?: Lens | null;
  added: number;
  removed: number;
  steps: { label: string; status: string }[];
  project?: WorkProject | null;
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

// Groove loop: bounce to the loudness, strike a photo pose every few
// bars. Poses hold ~1 s, then melt back into the groove.

// Cover accent: average the art down to one glowing color (same-origin
// art, so the canvas stays clean). Cached per URL, falls back warm red.
const accentCache = new Map<string, string>();
function coverAccent(url: string): Promise<string> {
  const hit = accentCache.get(url);
  if (hit) return Promise.resolve(hit);
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = 24;
        c.height = 24;
        const g = c.getContext("2d");
        if (!g) throw new Error("no 2d");
        g.drawImage(img, 0, 0, 24, 24);
        const d = g.getImageData(0, 0, 24, 24).data;
        let r = 0, g2 = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 128) continue;
          r += d[i];
          g2 += d[i + 1];
          b += d[i + 2];
          n++;
        }
        if (!n) throw new Error("empty");
        r = Math.round(r / n);
        g2 = Math.round(g2 / n);
        b = Math.round(b / n);
        // lift dull grays toward vivid so the glow always reads.
        const mx = Math.max(r, g2, b, 1);
        const lift = Math.max(0, 190 - mx);
        const out = `rgb(${Math.min(255, r + lift)},${Math.min(255, g2 + lift * 0.4)},${Math.min(255, b + lift * 0.4)})`;
        accentCache.set(url, out);
        res(out);
      } catch {
        res("#f43f5e");
      }
    };
    img.onerror = () => res("#f43f5e");
    img.src = url;
  });
}

// Groove loop: bounce to the loudness, strike a photo pose every few
// bars. Poses hold ~1 s, then melt back into the groove.
const GROOVE_LOOP = ["groove", "groove", "pose-up", "groove", "groove", "pose-up"];

// Home offline cache: last-good work/usage survive reloads with no
// internet (bridge polls revalidate when live). Same keys live in the SW
// runtime cache (public/sw.js CACHED_API) — belt and suspenders.
const WORK_KEY = "island.daily.work.v1";
const USAGE_KEY = "island.daily.usage.v1";
function loadCached<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
function saveCached(key: string, val: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch { /* private mode — memory only */ }
}
// Slim track bar (korus-minimal): art + title + clock + transport.
// No Up-Next rail — history isn't playable over MPRIS, so it stays out.
export function DailyView({ agentSessions = [], onResumeAgent, onGoChat, onRefreshSessions }: { agentSessions?: AgentMini[]; onResumeAgent?: (sid: string, first: string) => void; onGoChat?: () => void; onRefreshSessions?: () => void } = {}) {
  const [work, setWork] = useState<Work | null>(() => loadCached<Work>(WORK_KEY));
  const [usage, setUsage] = useState<Usage | null>(() => loadCached<Usage>(USAGE_KEY));
  // tapped mate drives the left card: his live session replaces the
  // global work view (no bottom pop-up). Shared with the grid below.
  const team = useTeam();
  const live = useSessionProgress(agentSessions);
  const [sel, setSel] = useState<string | null>(null);
  const selIdx = team.members.findIndex((m) => m.id === sel);
  const selSession = selIdx >= 0 ? slotSession(team.members, agentSessions, selIdx) : undefined;
  // Quiet turn poll for crew dispatch (assign/relay run in the
  // background — no chat UX, the tile lights up instead).
  const pollTurn = async (turn: string): Promise<{ ok: boolean; session?: string; error?: string }> => {
    const t0 = Date.now();
    for (;;) {
      await new Promise((r) => setTimeout(r, 2000));
      if (Date.now() - t0 > 600000) return { ok: false, error: "timed out after 10m" };
      try {
        const r = await fetch(`${API}/turn?id=${encodeURIComponent(turn)}`);
        const s = await r.json();
        if (!s.done) continue;
        if (!s.ok) return { ok: false, error: s.error || "agent failed" };
        return { ok: true, session: s.session };
      } catch { /* transient blip — keep polling */ }
    }
  };
  // Give-a-task: real turn as the mate (`[name·role] task`), new live
  // session pins to their slot so the tile tracks it.
  const assignTask = async (targetId: string, text: string) => {
    const m = team.members.find((x) => x.id === targetId);
    if (!m) return { ok: false, error: "no such mate" };
    try {
      const r = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `[${m.name}·${m.role}] ${text}`.slice(0, 4000) }),
      });
      const j = await r.json();
      if (!j.ok || !j.turn) return { ok: false, error: j.error || "bridge refused" };
      const s = await pollTurn(j.turn);
      if (!s.ok) return s;
      if (s.session) {
        team.setSid(targetId, s.session);
        live.refresh(s.session);
        onRefreshSessions?.();
      }
      return { ok: true };
    } catch {
      return { ok: false, error: "bridge unreachable" };
    }
  };
  // Crew relay: this mate's latest work becomes the target's turn
  // (bridge packs the shared brief from the event ledger).
  const relayTask = async (fromId: string, targetId: string, text: string) => {
    const fi = team.members.findIndex((x) => x.id === fromId);
    const tm = team.members.find((x) => x.id === targetId);
    const fs = fi >= 0 ? slotSession(team.members, agentSessions, fi) : undefined;
    if (!fs) return { ok: false, error: "mate has no live session yet" };
    if (!tm) return { ok: false, error: "no such mate" };
    try {
      const r = await fetch(`${API}/handoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_sid: fs.session,
          to_text: `[${tm.name}·${tm.role}] ${text || "carry this work forward"}`.slice(0, 4000),
        }),
      });
      const j = await r.json();
      if (!j.ok || !j.turn) return { ok: false, error: j.error || "bridge refused" };
      const s = await pollTurn(j.turn);
      if (!s.ok) return s;
      if (s.session) {
        team.setSid(targetId, s.session);
        live.refresh(s.session);
        onRefreshSessions?.();
      }
      return { ok: true };
    } catch {
      return { ok: false, error: "bridge unreachable" };
    }
  };
  // tapped tile with a live session takes over the left card.
  const mateOn = selIdx >= 0 && !!selSession;
  // session progress goes stale (single fetch on mount): re-pull every
  // mate on the work rhythm so the mid lens tracks the working loop.
  useEffect(() => {
    if (!agentSessions.length) return;
    const tick = () => {
      for (const s of agentSessions) live.refresh(s.session);
    };
    const t = setInterval(tick, 10000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentSessions.map((s) => s.session).join(",")]);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Last track paints with the rest on boot (same tick below) and survives
  // offline; live pos/playing revalidate over it.
  const [local, setLocal] = useState<NowPlaying | null>(() => loadCachedTrack());
  // music pending until the first nowplaying attempt settles (or cache
  // exists) — bones hold the capsule's grid area so the card never pops
  // the layout when it resolves. Honest flag, never a timed delay.
  const [musicSettled, setMusicSettled] = useState(() => loadCachedTrack() !== null);
  useEffect(() => {
    const pullWork = () => {
      fetch(`${API}/api/daily/work`)
        .then((r) => (r.ok ? r.json() : null))
        .then((w) => {
          if (w) {
            setWork(w);
            saveCached(WORK_KEY, w);
          }
        })
        .catch(() => {});
      fetch(`${API}/api/daily/usage`)
        .then((r) => (r.ok ? r.json() : null))
        .then((u) => {
          if (u) {
            setUsage(u);
            saveCached(USAGE_KEY, u);
          }
        })
        .catch(() => {});
      // music rides the same first tick so the capsule paints with the rest,
      // never pops in a beat late. Offline the fetch fails and the cached
      // track (if any) simply stays; either way bones retire on settle.
      fetchNowPlaying(window.location.origin, fetch)
        .then((t) => {
          setLocal((prev) => cacheTrack(mergeTrack(prev, t)));
          setMusicSettled(true);
        })
        .catch(() => setMusicSettled(true));
    };
    pullWork();
    const timer = setInterval(pullWork, 10000);
    return () => clearInterval(timer);
  }, []);

  // Local playback (bridge /nowplaying, playerctl/MPRIS): what's actually
  // playing on this PC right now. pullWork covers the first tick — this
  // 3s loop only refreshes. Idle polls are no-ops: mergeTrack keeps the
  // ref when a paused track re-polls identically, so the home card never
  // churns when nothing is audible.
  useEffect(() => {
    let dead = false;
    const pull = () => {
      fetchNowPlaying(window.location.origin, fetch)
        .then((t) => {
          if (dead) return;
          setLocal((prev) => cacheTrack(mergeTrack(prev, t)));
        })
        .catch(() => {});
    };
    const timer = setInterval(pull, 3000);
    // background tabs throttle intervals: a song changed while away
    // paints the moment we're seen again, not a minute later.
    const wake = () => {
      if (!document.hidden) pull();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    return () => {
      dead = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    };
  }, []);
  const cmd = (action: "play-pause" | "next" | "previous" | "seek", position?: number) => {
    const refresh = () => {
      fetchNowPlaying(window.location.origin, fetch)
        .then((t) => {
          setLocal((prev) => cacheTrack(mergeTrack(prev, t)));
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

  const pos =
    local?.pos !== null && local?.pos !== undefined && local?.len
      ? Math.min(local.pos, local.len)
      : null;
  const remain =
    local?.len !== null && local?.len !== undefined && pos !== null
      ? Math.max(0, local.len - pos)
      : null;
  const frac =
    local?.len ? Math.max(0, Math.min(1, (pos ?? 0) / local.len)) : 0;
  const rawArt = local ? resolveArt(local.art, window.location.origin) : null;
  // /np-art is one URL for every song — bust it per track or the old
  // cover (img + blur + accent) sticks after a song change.
  const art = rawArt && local && rawArt.includes("/np-art")
    ? `${rawArt}?t=${encodeURIComponent(trackKey(local))}`
    : rawArt;
  // Liked tracks: local only (no backend), survives reloads.
  const LIKED_KEY = "steroids-liked-tracks";
  const [liked, setLiked] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(LIKED_KEY);
      const arr: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string").slice(0, 200) : [];
    } catch {
      return [];
    }
  });
  const trackId = local ? trackKey(local) : "";
  const isLiked = !!trackId && liked.includes(trackId);
  const toggleLiked = () => {
    if (!trackId) return;
    setLiked((prev) => {
      const next = prev.includes(trackId)
        ? prev.filter((x) => x !== trackId)
        : [...prev, trackId].slice(-200);
      try {
        localStorage.setItem(LIKED_KEY, JSON.stringify(next));
      } catch {
        /* private mode — memory only */
      }
      return next;
    });
  };
  // Accent follows the cover: re-extract only when the art URL changes.
  const [accent, setAccent] = useState("#f43f5e");
  useEffect(() => {
    let dead = false;
    if (!art) {
      setAccent("#f43f5e");
      return;
    }
    void coverAccent(art).then((c) => {
      if (!dead) setAccent(c);
    });
    return () => {
      dead = true;
    };
  }, [art]);
  const [groove, setGroove] = useState("groove");
  const danceRef = useRef<HTMLSpanElement>(null);
  const dancing = !!local?.title && !!local.playing;
  // Energy loop: loudness rides --e on the dancer + the stage; hop:true
  // kicks a jump. Polls only while a track exists (no parec otherwise).
  useEffect(() => {
    const dancer = danceRef.current;
    if (!dancing) {
      dancer?.classList.remove("grooving", "hop");
      return;
    }
    let dead = false;
    const tick = () => {
      fetch(`${window.location.origin}/audio-energy`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          if (dead) return;
          const el = danceRef.current;
          const e = typeof j?.energy === "number" ? Math.max(0, Math.min(1, j.energy)) : 0;
          el?.style.setProperty("--e", e.toFixed(2));
          el?.classList.add("grooving");
          if (j?.hop && el) {
            el.classList.remove("hop");
            void el.offsetWidth;
            el.classList.add("hop");
          }
        })
        .catch(() => {});
    };
    tick();
    const timer = setInterval(tick, 150);
    return () => {
      dead = true;
      clearInterval(timer);
    };
  }, [dancing, local?.title]);
  // Mood machine: finished > error > music×energy > thinking >
  // late-night idle > neutral. 5 s hysteresis — never flickers.
  const [mood, setMood] = useState<MascotMood>("neutral");
  const energyRef = useRef(0);
  const lastPoke = useRef(0);
  const moodCand = useRef<{ m: MascotMood; since: number }>({ m: "neutral", since: 0 });
  useEffect(() => {
    const tick = () => {
      const h = new Date().getHours();
      let m: MascotMood = "neutral";
      if (work?.state === "finished") m = "joyful-wide";
      else if (work?.state === "error") m = "annoyed";
      else if (dancing) m = energyRef.current > 0.55 ? "joyful-wide" : "happy";
      else if (work?.state === "thinking" || work?.state === "working") m = "thinking";
      else if ((h >= 23 || h < 6) && Date.now() - lastPoke.current > 60000) m = "sleepy-squint";
      const now = Date.now();
      if (m !== moodCand.current.m) moodCand.current = { m, since: now };
      if (now - moodCand.current.since >= 5000) {
        setMood((cur) => (cur === moodCand.current.m ? cur : moodCand.current.m));
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [dancing, work?.state]);
  // Groove cycler: hold the bounce, flash a pose, melt back.
  useEffect(() => {
    if (!dancing) {
      setGroove("groove");
      return;
    }
    let i = 0;
    let back: ReturnType<typeof setTimeout> | null = null;
    setGroove(GROOVE_LOOP[0]);
    const timer = setInterval(() => {
      i = (i + 1) % GROOVE_LOOP.length;
      const g = GROOVE_LOOP[i];
      setGroove(g);
      if (g !== "groove") {
        if (back) clearTimeout(back);
        back = setTimeout(() => setGroove("groove"), 1200);
      }
    }, 4000);
    return () => {
      clearInterval(timer);
      if (back) clearTimeout(back);
    };
  }, [dancing, local?.title]);
  return (
    <Card className="daily home-min">
      <div className="hm-grid">
        {/* Work capsule: nicki + global work by default; tapped mate owns
            the whole card korus-style (mascot row on top, his steps below). */}
        <div className="live work" style={{ ["--live-accent" as string]: "#fb923c" }}>
          <div className={mateOn ? "live-main mate-on" : "live-main"}>
            {/* rail is just the buddy — name + file already live below. */}
            <span className="live-nicki">
              <span ref={danceRef} className={dancing ? `live-char dance grooving ${groove}` : "live-char dance"} aria-hidden>
                <Mascot mood={mood} onTap={() => { lastPoke.current = Date.now(); }} />
              </span>
            </span>
            <div className="live-body">
              {!online && <span className="offline-badge">offline · cached</span>}
              {mateOn && selSession ? (
                <MemberDetail
                  member={team.members[selIdx]}
                  session={selSession}
                  progress={live.prog[selSession.session]}
                  manage={false}
                  onClose={() => setSel(null)}
                  team={team.members}
                  onAssign={assignTask}
                  onRelay={relayTask}
                />
              ) : work === null ? (
                <div className="bone-stack">
                  <WorkBones />
                  {!online && <span className="offline-badge">offline · waiting for bridge</span>}
                </div>
              ) : work.asks === 0 ? (
                <div className="live-top">
                  <span className="live-hero">calm</span>
                  <span className="live-sub">nothing logged yet</span>
                </div>
              ) : (
                <>
                  <div className="live-now">
                    <i className={(work.state === "working" || work.state === "thinking") ? "work-pulse" : "dead-dot"} />
                    <span>{work.activity.replace(/^· /, "") || work.state}</span>
                  </div>
                  <div className="live-top">
                    <span className="live-hero">{work.pct}%</span>
                    <span className="live-sub">
                      {work.project?.name || work.state}
                      {!!work.current && ` · ${work.current}`}
                    </span>
                    <span className="live-side">{work.done}/{work.asks}</span>
                  </div>
                  <SegBar ratio={work.pct / 100} n={20} />
                  <div className="live-dim">
                    {work.activity.replace(/^· /, "") || work.state}
                    {(work.added > 0 || work.removed > 0) && ` +${work.added} −${work.removed}`}
                    {(work.project?.docs?.length ?? 0) > 0 &&
                      ` · 📄 ${(work.project?.docs ?? []).slice(0, 2).map((d) => d.name).join(" · ")}`}
                  </div>
                  {work.steps.length > 0 && (
                    <StepsList steps={work.steps} />
                  )}
                  <div className="live-tokens">
                    <span>
                      {usage ? (
                        <>
                          <span className="tok-total">⚡ {fmtTokens(usage.today.in + usage.today.out)}</span>
                          <span className="tok-split">{fmtTokens(usage.today.in)} in / {fmtTokens(usage.today.out)} out · {usage.today.sessions} sess</span>
                        </>
                      ) : (
                        "⚡ checking usage…"
                      )}
                    </span>
                    <SegBar
                      ratio={usage && (usage.today.in + usage.today.out) > 0
                        ? usage.today.in / (usage.today.in + usage.today.out)
                        : 0}
                      n={16}
                      flat
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="hm-right">
        {/* Team capsule (right top, where tokens was): 2x2 crew grid. */}
        <div className="hm-team">
          <TeamGrid sessions={agentSessions} onResume={onResumeAgent} onGoChat={onGoChat} sel={sel} onSel={setSel} detail="none" team={team} live={live} />
        </div>

        {/* Sugar capsule (right, full height): cover-blend glow, add, seek, transport.
            Bones hold the grid area while the first nowplaying is pending so
            the card paints with the rest instead of popping the layout. */}
        {local?.title ? (
          <div className="live music combo" style={{ ["--live-accent" as string]: accent }}>
            {!!art && (
              <>
                <div className="live-blur" style={{ backgroundImage: `url("${art}")` }} aria-hidden />
                <div className="live-shade" aria-hidden />
              </>
            )}
            <div className="sugar-row">
              {!!art && (
                <img src={art} alt="" className="sugar-art" loading="lazy" />
              )}
              <span className="sugar-meta">
                <b>{local.title}</b>
                {!!local.artist && <span>{local.artist}</span>}
              </span>
              <button
                className="sugar-add"
                aria-label={isLiked ? "Liked" : "Like this track"}
                title={isLiked ? "Liked ✓" : "Like this track"}
                onClick={toggleLiked}
                style={isLiked ? { borderColor: accent, color: accent } : undefined}
              >
                {isLiked ? "✓" : "+"}
              </button>
            </div>
            <div
              className="sugar-seek"
              role="slider"
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={local.len ?? 0}
              aria-valuenow={pos ?? 0}
              onClick={(e) => {
                if (!local.len) return;
                const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const f = Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width)));
                cmd("seek", f * local.len);
              }}
            >
              <i className="sugar-fill" style={{ width: `${Math.round(frac * 100)}%` }} />
              <i className="sugar-knob" style={{ left: `${Math.round(frac * 100)}%` }} />
            </div>
            <div className="sugar-times">
              <span>{fmtClock(pos)}</span>
              <span>-{fmtClock(remain)}</span>
            </div>
            <div className="sugar-transport">
              <button aria-label="Previous track" onClick={() => cmd("previous")}>
                <PrevIcon size={17} />
              </button>
              <button className="sugar-main" aria-label={local.playing ? "Pause" : "Play"} onClick={() => cmd("play-pause")}>
                {local.playing ? <PauseIcon size={17} /> : <PlayIcon size={17} />}
              </button>
              <button aria-label="Next track" onClick={() => cmd("next")}>
                <NextIcon size={17} />
              </button>
            </div>
          </div>
        ) : !musicSettled ? (
          <div className="live music combo" aria-hidden>
            <MusicBones />
          </div>
        ) : null}
        </div>
      </div>
    </Card>
  );
}
