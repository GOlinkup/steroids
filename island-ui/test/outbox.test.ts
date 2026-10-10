// Outbox proofs: order, same-key retry, cancel, restart survival.
// Runs under node --test (type stripping, no deps, no DOM).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OutboxStore } from "../src/outbox.ts";
import type { StorageLike } from "../src/relay.ts";

function memStore(seed = new Map<string, string>()): StorageLike {
  return {
    getItem: (k) => seed.get(k) ?? null,
    setItem: (k, v) => void seed.set(k, v),
    removeItem: (k) => void seed.delete(k),
  };
}

describe("outbox", () => {
  it("airplane toggle x3: each reply fires once, in order", async () => {
    const backing = new Map<string, string>();
    const outbox = new OutboxStore(memStore(backing));
    outbox.enqueue("reply", { text: "one" });
    outbox.enqueue("reply", { text: "two" });
    const ids = outbox.pending().map((i) => i.id);
    const seen: string[] = [];
    let online = false;
    const fired = await outbox.flush(async (f) => {
      if (!online) return false;
      seen.push(`${f.id}:${f.text}`);
      return true;
    });
    assert.equal(fired, 0); // offline: head stays
    assert.equal(outbox.pending().length, 2);
    online = true; // reconnect x3 (same call covers all toggles)
    assert.equal(await outbox.flush(async () => false), 0);
    assert.equal(await outbox.flush(async (f) => {
      seen.push(`${f.id}:${f.text}`);
      return true;
    }), 2);
    assert.deepEqual(seen, [`${ids[0]}:one`, `${ids[1]}:two`]);
    assert.equal(outbox.pending().length, 0);
  });

  it("flaky reconnect retries same id: far end sees it once", async () => {
    const outbox = new OutboxStore(memStore());
    outbox.enqueue("reply", { text: "hi" });
    const id = outbox.pending()[0].id;
    const delivered = new Set<string>();
    // First attempt flakes: head stays queued under the same id.
    assert.equal(await outbox.flush(async () => false), 0);
    assert.equal(outbox.pending().length, 1);
    assert.equal(outbox.pending()[0].id, id);
    // Retry fires it; a duplicate retry would throw (far end dedups).
    const fired = await outbox.flush(async (f) => {
      if (delivered.has(f.id as string)) throw new Error("double fire");
      delivered.add(f.id as string);
      return true;
    });
    assert.equal(fired, 1);
    assert.deepEqual([...delivered], [id]);
  });

  it("cancel before fire removes; unknown key false", () => {
    const outbox = new OutboxStore(memStore());
    const key = outbox.enqueue("reply", { text: "nvm" });
    assert.equal(outbox.cancel("nope"), false);
    assert.equal(outbox.cancel(key), true);
    assert.equal(outbox.pending().length, 0);
  });

  it("queue survives restart (durably in storage)", async () => {
    const backing = new Map<string, string>();
    const a = new OutboxStore(memStore(backing));
    a.enqueue("reply", { text: "later" });
    const b = new OutboxStore(memStore(backing)); // "restart"
    assert.equal(b.pending().length, 1);
    assert.equal(await b.flush(async () => true), 1);
  });

  it("pre-split stored items backfill id from key", () => {
    const backing = new Map<string, string>();
    backing.set("island_outbox_v1", JSON.stringify([
      { key: "old-k", type: "reply", payload: { text: "x" }, enqueuedAt: "2026-01-01T00:00:00Z" },
    ]));
    const outbox = new OutboxStore(memStore(backing));
    assert.equal(outbox.pending()[0].id, "old-k");
  });
});
