// Voice play-hook proofs: parse rule, fixture-locked id walk, resolve +
// oEmbed confirm, honest nulls. Fake fetch under node --test (no deps).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { embedUrl, firstVideoId, musicQueryOf, resolveTrack } from "../src/voicePlay.ts";

function fakeFetch(routes: Record<string, { status?: number; body: unknown }>) {
  const calls: Array<{ url: string; init?: unknown }> = [];
  const fn = (url: string, init?: unknown) => {
    calls.push({ url, init });
    const hit = Object.entries(routes).find(([k]) => url.startsWith(k))?.[1];
    if (!hit) return Promise.reject(new Error(`no route: ${url}`));
    return Promise.resolve({ status: hit.status ?? 200, json: () => Promise.resolve(hit.body) });
  };
  return { fn, calls };
}

const SEARCH_BODY = {
  contents: {
    twoColumnSearchResultsRenderer: {
      primaryContents: {
        sectionListRenderer: {
          contents: [
            { itemSectionRenderer: { contents: [{ videoRenderer: { videoId: "abc123XYZ_-" } }] } },
          ],
        },
      },
    },
  },
};

describe("musicQueryOf", () => {
  it("parses 'play X' case-insensitively, trims", () => {
    assert.equal(musicQueryOf("play leeds united anthems"), "leeds united anthems");
    assert.equal(musicQueryOf("  PLAY  night drive  "), "night drive");
  });
  it("null when not a music ask", () => {
    assert.equal(musicQueryOf("player stats"), null);
    assert.equal(musicQueryOf("play"), null);
    assert.equal(musicQueryOf("play   "), null);
    assert.equal(musicQueryOf("replay that song"), null);
  });
});

describe("firstVideoId", () => {
  it("walks the fixture to the first videoRenderer id", () => {
    assert.equal(firstVideoId(SEARCH_BODY), "abc123XYZ_-");
  });
  it("drifted shapes give null, never a guess", () => {
    assert.equal(firstVideoId(null), null);
    assert.equal(firstVideoId({}), null);
    assert.equal(firstVideoId({ contents: {} }), null);
  });
});

describe("embedUrl", () => {
  it("is the nocookie host", () => {
    assert.equal(embedUrl("abc123XYZ_-"), "https://www.youtube-nocookie.com/embed/abc123XYZ_-?rel=0");
  });
});

describe("resolveTrack", () => {
  it("search + oEmbed confirm gives a titled track", async () => {
    const { fn, calls } = fakeFetch({
      "https://www.youtube.com/youtubei/v1/search": { body: SEARCH_BODY },
      "https://www.youtube.com/oembed": { body: { title: "Night Drive", author_name: "Synth FM" } },
    });
    const t = await resolveTrack("night drive", fn);
    assert.deepEqual(t, { videoId: "abc123XYZ_-", title: "Night Drive", author: "Synth FM" });
    assert.equal(calls.length, 2);
  });
  it("dead search / drift / offline all resolve null", async () => {
    const { fn } = fakeFetch({ "https://www.youtube.com/youtubei/v1/search": { status: 500, body: {} } });
    assert.equal(await resolveTrack("x", fn), null);
    const drift = fakeFetch({ "https://www.youtube.com/youtubei/v1/search": { body: { contents: {} } } });
    assert.equal(await resolveTrack("x", drift.fn), null);
    const down = fakeFetch({});
    assert.equal(await resolveTrack("x", down.fn), null);
  });
});
