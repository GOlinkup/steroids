// Music fetch-layer proofs: normalize, transport, clock math.
// Fake fetch under node --test (no deps, no DOM).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  NO_MUSIC, fetchNowPlaying, normalizeNowPlaying, sendPlayerCmd,
  fmtClock, resolveArt, seekFrac, mergeTrack, pushHistory, trackKey,
  type NowPlaying,
} from "../src/music.ts";

function fakeFetch(routes: Record<string, unknown>) {
  const calls: Array<{ url: string; init?: unknown }> = [];
  const fn = (url: string, init?: unknown) => {
    calls.push({ url, init });
    return Promise.resolve({ json: () => Promise.resolve(routes[url]) });
  };
  return { fn, calls };
}

describe("normalizeNowPlaying", () => {
  it("passes a full bridge payload through", () => {
    const t = normalizeNowPlaying({
      playing: true, player: "spotify", title: "T", artist: "A",
      album: "Al", art: "http://x", status: "Playing", pos: 12, len: 200,
    });
    assert.equal(t.playing, true);
    assert.equal(t.title, "T");
    assert.equal(t.pos, 12);
  });
  it("junk in, NO_MUSIC shape out", () => {
    assert.deepEqual(normalizeNowPlaying(null), NO_MUSIC);
    assert.deepEqual(normalizeNowPlaying("nope"), NO_MUSIC);
    assert.deepEqual(normalizeNowPlaying({}), NO_MUSIC);
  });
  it("drops non-string/non-number fields", () => {
    const t = normalizeNowPlaying({ playing: 1, title: 42, pos: "x", len: NaN });
    assert.equal(t.playing, false);
    assert.equal(t.title, null);
    assert.equal(t.pos, null);
  });
});

describe("fetchNowPlaying", () => {
  it("hits /nowplaying and normalizes", async () => {
    const { fn, calls } = fakeFetch({ "http://b/nowplaying": { playing: true, title: "T" } });
    const t = await fetchNowPlaying("http://b", fn);
    assert.equal(calls[0].url, "http://b/nowplaying");
    assert.equal(t.title, "T");
  });
});

describe("sendPlayerCmd", () => {
  it("posts action + player, returns ok", async () => {
    const { fn, calls } = fakeFetch({ "http://b/playercmd": { ok: true } });
    const ok = await sendPlayerCmd("http://b", fn, "next", { player: "spotify" });
    assert.equal(ok, true);
    const init = calls[0].init as { body: string };
    assert.deepEqual(JSON.parse(init.body), { action: "next", player: "spotify" });
  });
  it("seek carries position, failure is false", async () => {
    const { fn, calls } = fakeFetch({ "http://b/playercmd": { ok: false } });
    const ok = await sendPlayerCmd("http://b", fn, "seek", { position: 30 });
    assert.equal(ok, false);
    const init = calls[0].init as { body: string };
    assert.deepEqual(JSON.parse(init.body), { action: "seek", position: 30 });
  });
});

describe("resolveArt", () => {
  it("file:// thumbs ride /np-art", () => {
    assert.equal(resolveArt("file:///tmp/.org.chromium.X", "http://b"), "http://b/np-art");
  });
  it("http art passes through, null stays null", () => {
    assert.equal(resolveArt("http://x/a.jpg", "http://b"), "http://x/a.jpg");
    assert.equal(resolveArt(null, "http://b"), null);
  });
});

describe("clock math", () => {
  it("fmtClock", () => {
    assert.equal(fmtClock(0), "0:00");
    assert.equal(fmtClock(65), "1:05");
    assert.equal(fmtClock(null), "--:--");
    assert.equal(fmtClock(-3), "--:--");
  });
  it("seekFrac null-safe", () => {
    const base: NowPlaying = { ...NO_MUSIC, pos: 30, len: 120 };
    assert.equal(seekFrac(base), 0.25);
    assert.equal(seekFrac({ ...base, len: null }), null);
    assert.equal(seekFrac({ ...base, len: 0 }), null);
  });
});

describe("mergeTrack idle-freeze", () => {
  const paused: NowPlaying = {
    ...NO_MUSIC, hasPlayerctl: true, playing: false, player: "brave",
    title: "Leave Me Alone", artist: "NF", pos: 3, len: 309, status: "Paused",
  };
  it("re-polled paused track keeps ref (no home churn)", () => {
    const again = { ...paused };
    assert.equal(mergeTrack(paused, again), paused);
  });
  it("play/pause flip is a real change", () => {
    const playing = { ...paused, playing: true, status: "Playing" };
    assert.equal(mergeTrack(paused, playing), playing);
  });
  it("playing pos jitter <2s is ignored, >=2s paints", () => {
    const base: NowPlaying = { ...paused, playing: true, status: "Playing", pos: 10 };
    assert.equal(mergeTrack(base, { ...base, pos: 11 }), base);
    const moved = { ...base, pos: 13 };
    assert.equal(mergeTrack(base, moved), moved);
  });
  it("empty poll keeps last track sticky, null only before anything seen", () => {
    assert.equal(mergeTrack(paused, { ...NO_MUSIC }), paused);
    assert.equal(mergeTrack(null, { ...NO_MUSIC }), null);
  });
});

describe("pushHistory up-next rail", () => {
  const t: NowPlaying = {
    ...NO_MUSIC, playing: true, player: "brave",
    title: "Leave Me Alone", artist: "NF", len: 309,
  };
  it("inserts newest-first, dedupes, caps at 8", () => {
    let h = pushHistory([], t);
    assert.equal(h.length, 1);
    assert.equal(h[0].title, "Leave Me Alone");
    h = pushHistory(h, t);
    assert.equal(h.length, 1); // same track re-polled: no dup
    for (let i = 0; i < 10; i++) {
      h = pushHistory(h, { ...t, title: `Song ${i}` });
    }
    assert.equal(h.length, 8);
    assert.equal(h[0].title, "Song 9");
    assert.equal(h[0].key, trackKey({ ...t, title: "Song 9" }));
  });
  it("title-less polls never enter history", () => {
    assert.deepEqual(pushHistory([], { ...NO_MUSIC }), []);
  });
});
