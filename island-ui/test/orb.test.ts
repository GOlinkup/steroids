// Activity -> orb mapper proofs: priority order + idle breathes.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { IDLE_ACTIVITY, orbFor } from "../src/orb_state.ts";
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
