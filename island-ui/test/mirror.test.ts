// Mirror-only proofs: null reads empty, rows assemble, nothing invented.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assembleMirror, isEmptyProfile } from "../src/mirror.ts";

describe("assembleMirror", () => {
  it("null reads honest empty", () => {
    assert.equal(isEmptyProfile(assembleMirror(null)), true);
    assert.equal(isEmptyProfile(assembleMirror(undefined)), true);
    assert.equal(isEmptyProfile(assembleMirror({})), true);
  });

  it("linked rows assemble, unlinked fields stay empty", () => {
    const p = assembleMirror({
      user_id: "u1",
      handle: "Lerato M",
      verified: true,
      gigs_done: 3,
      gigs_saved: 2,
    });
    assert.equal(isEmptyProfile(p), false);
    assert.equal(p.handle, "Lerato M");
    assert.equal(p.verified, true);
    assert.equal(p.gigs_done, 3);
    assert.equal(p.bio, null);
    assert.deepEqual(p.links, []);
  });

  it("missing handle falls back, never invents", () => {
    assert.equal(assembleMirror({ user_id: "u9" }).handle, "");
  });
});
