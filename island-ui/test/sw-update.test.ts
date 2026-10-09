// SW-update guard: a fresh worker must never yank a live chat for an
// update — the same app the user is messaging from. Empty states and
// walked-away drafts reload immediately; the deferred page picks the new
// worker up on its next clean load.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldDeferSwReload } from "../src/sw_guard.ts";

const NOW = 1_700_000_000_000;
const fresh = JSON.stringify({ messages: [], session: "abc", at: NOW - 60_000 });
const stale = JSON.stringify({ messages: [], session: "abc", at: NOW - 16 * 60_1000 });

describe("shouldDeferSwReload", () => {
  it("defers on a fresh transcript (messaging now)", () => {
    assert.equal(shouldDeferSwReload(fresh, null, NOW), true);
  });
  it("reloads on a stale transcript (walked away)", () => {
    assert.equal(shouldDeferSwReload(stale, null, NOW), false);
  });
  it("defers on unsent typing alone (no transcript yet)", () => {
    assert.equal(shouldDeferSwReload(null, "hello ag…", NOW), true);
  });
  it("reloads on empty states (nothing to lose)", () => {
    assert.equal(shouldDeferSwReload(null, null, NOW), false);
    assert.equal(shouldDeferSwReload(null, "", NOW), false);
  });
  it("reloads on corrupt storage (never strands the update)", () => {
    assert.equal(shouldDeferSwReload("{nope", null, NOW), false);
  });
});
