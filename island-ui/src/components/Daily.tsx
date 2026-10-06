import { useEffect, useState } from "react";
import { Card } from "./Cards";
import { PillButton } from "./pickers";

// React daily — briefing + day loop + music, zero keys anywhere.
// All data rides the island backend (:8906, keyless GDELT/RSS/Meteo).
// Offline serves the stamped cache; the stamp is always shown.

const API = "http://127.0.0.1:8906";

interface Headline { title: string; url: string; source: string }
interface Briefing {
  weatherLine: string;
  headlines: Headline[];
  fetchedAt: number; // epoch seconds
  offline: boolean;
}
interface DayEvent { type: string; label: string; at: number }
interface Track { videoId: string; title: string; author: string }

function ageLabel(fetchedAt: number): string {
  const age = Date.now() / 1000 - fetchedAt;
  if (age < 60) return "just now";
  if (age < 3600) return `${Math.floor(age / 60)}m ago`;
  if (age < 86400) return `${Math.floor(age / 3600)}h ago`;
  return `${Math.floor(age / 86400)}d ago`;
}

function dayKey(): string {
  return `daily-dismiss-${new Date().toISOString().slice(0, 10)}`;
}

const QUICK_PICKS = ["amapiano mix", "gqom mix", "afro house mix"];

export function DailyView() {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [events, setEvents] = useState<DayEvent[] | null>(null);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(dayKey()) === "1"
  );
  const [query, setQuery] = useState("");
  const [track, setTrack] = useState<Track | null>(null);
  const [musicMiss, setMusicMiss] = useState(false);
  const [showPicks, setShowPicks] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/daily/briefing`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => b && setBriefing(b))
      .catch(() => {});
    fetch(`${API}/api/daily/today`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setEvents(d.events ?? []))
      .catch(() => {});
  }, []);

  function dismiss() {
    localStorage.setItem(dayKey(), "1");
    setDismissed(true);
  }

  function ask(q: string) {
    const text = q.trim();
    if (!text) return;
    setMusicMiss(false);
    setTrack(null);
    fetch(`${API}/api/daily/music?q=${encodeURIComponent(text)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.track) {
          setTrack(d.track);
          fetch(`${API}/api/daily/log`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "music_play",
              label: `Played ${d.track.title}`,
            }),
          }).catch(() => {});
        } else {
          setMusicMiss(true);
        }
      })
      .catch(() => setMusicMiss(true));
  }

  return (
    <Card className="daily">
      {/* Day-open: the briefing opens the day. One tap skips. */}
      {!dismissed && (
        <div className="card-row">
          <div>
            <div className="card-title">Good morning ☀️</div>
            {briefing ? (
              <>
                {briefing.weatherLine && <div>{briefing.weatherLine}</div>}
                <ul className="daily-list">
                  {briefing.headlines.map((h, i) => (
                    <li key={i}>
                      <a href={h.url} target="_blank" rel="noreferrer">
                        {h.title}
                      </a>{" "}
                      <span className="kind-tag">{h.source}</span>
                    </li>
                  ))}
                </ul>
                {briefing.headlines.length === 0 && (
                  <div className="card-detail">
                    Nothing fresh right now — check back later.
                  </div>
                )}
                <div className="card-detail">
                  {ageLabel(briefing.fetchedAt)}
                  {briefing.offline ? " · offline copy" : ""}
                </div>
              </>
            ) : (
              <div className="card-detail">Waking the briefing…</div>
            )}
          </div>
          <div className="btn-row">
            <PillButton onClick={dismiss}>Skip day →</PillButton>
          </div>
        </div>
      )}

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

      {/* Music: explicit ask → working embed. Suggestions dismissible. */}
      <div className="card-row">
        <div className="card-title">Play something 🎵</div>
        {showPicks && (
          <div className="btn-row">
            {QUICK_PICKS.map((p) => (
              <button key={p} className="demo-link" onClick={() => ask(p)}>
                {p}
              </button>
            ))}
            <button
              className="chip-x"
              aria-label="Dismiss suggestions"
              onClick={() => setShowPicks(false)}
            >
              ✕
            </button>
          </div>
        )}
        <div className="btn-row">
          <input
            className="composer-input"
            value={query}
            placeholder="play …"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") ask(query);
            }}
          />
          <PillButton className="primary" onClick={() => ask(query)}>
            Play
          </PillButton>
        </div>
        {musicMiss && (
          <div className="card-detail">
            Couldn't find that track. Try another name.
          </div>
        )}
        {track && (
          <>
            <div className="card-detail">
              {track.title}
              {track.author ? ` — ${track.author}` : ""}
            </div>
            <iframe
              title={track.title}
              width="100%"
              height="220"
              src={`https://www.youtube-nocookie.com/embed/${track.videoId}?rel=0`}
              allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
            <div className="card-detail">
              Background play needs YouTube Premium — audio pauses if you
              leave the app.
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
