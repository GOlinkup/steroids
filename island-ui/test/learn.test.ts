// Learn-me proofs: observe/view/delete, 3-Q skip, week-sim rank.
// Zero-network module: Map-backed store, injected clock.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LearnLog } from "../src/learn.ts";

function memStore(seed = new Map<string, string>()) {
  return {
    getItem: (k: string) => seed.get(k) ?? null,
    setItem: (k: string, v: string) => void seed.set(k, v),
    removeItem: (k: string) => void seed.delete(k),
  };
}

describe("learn-me", () => {
  it("observe / view / delete round-trip", () => {
    const log = new LearnLog(memStore(), () => new Date("2026-10-05T08:00:00Z"));
    log.observe("app_open");
    log.observe("gig_view:delivery");
    assert.deepEqual(
      log.all().map((m) => m.e),
      ["app_open", "gig_view:delivery"],
    );
    log.clear();
    assert.deepEqual(log.all(), []);
    assert.equal(log.daysObserved(), 0);
  });

  it("one-tap skip marks done; answers store at most 3", () => {
    const log = new LearnLog(memStore());
    assert.equal(log.questionsDone(), false);
    log.skipQuestions();
    assert.equal(log.questionsDone(), true);
  });

  it("fresh log is honest: unchanged order + learning note", () => {
    const log = new LearnLog(
      memStore(),
      () => new Date("2026-10-05T08:00:00Z"),
    );
    log.observe("gig_view:delivery");
    const picks = [
      { id: "r1", category: "remote" },
      { id: "d1", category: "delivery" },
    ];
    const { ranked, note } = log.suggest(picks);
    assert.deepEqual(ranked.map((p) => p.id), ["r1", "d1"]);
    assert.match(note ?? "", /1 of ~7 days/);
  });

  it("week-simulation: affinity ranks delivery first, note clears", () => {
    const backing = new Map<string, string>();
    let day = new Date("2026-09-27T08:00:00Z");
    for (let i = 0; i < 8; i++) {
      const at = new Date(day);
      const log = new LearnLog(memStore(backing), () => at);
      log.observe("app_open");
      if (i % 2 === 0) log.observe("gig_view:delivery");
      day = new Date(day.getTime() + 86400000);
    }
    const log = new LearnLog(memStore(backing), () => day);
    log.observe("gig_save:delivery");
    log.observe("gig_view:remote");
    const { ranked, note } = log.suggest([
      { id: "r1", category: "remote" },
      { id: "d1", category: "delivery" },
      { id: "d2", category: "delivery" },
    ]);
    assert.equal(ranked[0].category, "delivery");
    assert.equal(note, null);
  });
});
