// Support path rule: uid-folder RLS match can never break (no slashes,
// no traversal), always under 64 chars of sanitized name.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSupportPath } from "../src/sync.ts";

describe("buildSupportPath", () => {
  it("prefixes uid + ms, lowercases + sanitizes", () => {
    assert.equal(
      buildSupportPath("u1", "Screen Shot 12:04.PNG", 7),
      "u1/7-screen-shot-12-04.png",
    );
  });
  it("falls back on junk names", () => {
    assert.equal(buildSupportPath("u1", "???", 7), "u1/7--");
  });
});
