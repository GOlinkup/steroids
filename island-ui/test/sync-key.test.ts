// Login key rule: a fresh login must NOT mint a new sync secret when the
// cloud holds sealed rows (second device) — minting orphans the real key
// and strands history behind "need the sync code" with no paste box.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldMintSyncKey } from "../src/sync.ts";

describe("shouldMintSyncKey", () => {
  it("mints on first-ever login (no key, nothing sealed)", () => {
    assert.equal(shouldMintSyncKey(false, 0), true);
  });
  it("never mints over an existing key", () => {
    assert.equal(shouldMintSyncKey(true, 0), false);
    assert.equal(shouldMintSyncKey(true, 3), false);
  });
  it("does NOT mint on a second device (no key, sealed rows waiting)", () => {
    assert.equal(shouldMintSyncKey(false, 2), false);
  });
});
