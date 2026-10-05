// Scope-cut proof: the notification copy states browser-only scope and
// never promises phone mirroring. Runs under node --test (no DOM).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  NOTIFY_DENIED_GUIDE,
  NOTIFY_SCOPE_BODY,
  NOTIFY_SCOPE_TITLE,
} from "../src/notify_copy.ts";

describe("notification scope copy", () => {
  it("states browser-only scope", () => {
    assert.match(NOTIFY_SCOPE_TITLE, /this browser/i);
    assert.match(NOTIFY_SCOPE_BODY, /web page|browser/i);
    assert.match(NOTIFY_SCOPE_BODY, /native card/);
  });

  it("never promises phone mirroring", () => {
    for (const s of [NOTIFY_SCOPE_TITLE, NOTIFY_SCOPE_BODY, NOTIFY_DENIED_GUIDE]) {
      assert.doesNotMatch(s, /mirror (your|phone) notifications/i);
      assert.doesNotMatch(s, /all your notifications/i);
    }
  });

  it("denied path guides instead of dead-ending", () => {
    assert.match(NOTIFY_DENIED_GUIDE, /keeps working/i);
  });
});
