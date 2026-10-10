// Activity -> orb mapper proofs: priority order + idle breathes.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { IDLE_ACTIVITY, chatOrbFor, orbFor } from "../src/orb_state.ts";
import type { IslandActivity } from "../src/orb_state.ts";

const base: IslandActivity = { ...IDLE_ACTIVITY };

describe("orbFor", () => {
  it("idle breathes (never a black void)", () => {
    assert.equal(orbFor(base), "breathing");
  });

  it("priority: listening > thinking > connecting > queue > search", () => {
    assert.equal(orbFor({ ...base, searching: true }), "searching");
    assert.equal(
      orbFor({ ...base, searching: true, outboxPending: 2 }),
      "weaving",
    );
    assert.equal(
      orbFor({ ...base, outboxPending: 1, relay: "connecting" }),
      "connecting",
    );
    assert.equal(
      orbFor({ ...base, relay: "connecting", thinking: true }),
      "working",
    );
    assert.equal(
      orbFor({ ...base, thinking: true, listening: true }),
      "listening",
    );
  });

  it("chat turn maps to working, relay handshake to connecting", () => {
    assert.equal(orbFor({ ...base, thinking: true }), "working");
    assert.equal(orbFor({ ...base, relay: "connecting" }), "connecting");
    assert.equal(orbFor({ ...base, relay: "connected" }), "breathing");
    assert.equal(orbFor({ ...base, relay: "offline" }), "breathing");
  });
});

describe("chatOrbFor", () => {
  it("bridge down breathes (honest idle)", () => {
    assert.equal(chatOrbFor({ bridgeOn: false }), "breathing");
  });

  it("idle turn defaults to working", () => {
    assert.equal(chatOrbFor({ bridgeOn: true }), "working");
  });

  it("priority: searching > solving > composing > working", () => {
    assert.equal(
      chatOrbFor({ bridgeOn: true, activity: "Searching the web", stepsActive: true, partial: "half an answer" }),
      "searching",
    );
    assert.equal(
      chatOrbFor({ bridgeOn: true, activity: "Reading foo.ts", partial: "half an answer" }),
      "searching",
    );
    assert.equal(
      chatOrbFor({ bridgeOn: true, stepsActive: true, partial: "half an answer" }),
      "solving",
    );
    assert.equal(
      chatOrbFor({ bridgeOn: true, partial: "half an answer" }),
      "composing",
    );
  });
});
