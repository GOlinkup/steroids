// Subunit money proofs: exact strings + shape audit (mirrors gigs.py).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { moneyCents, moneyLine } from "../src/money.ts";

describe("moneyCents", () => {
  it("exact strings, no floats", () => {
    assert.equal(moneyCents(0), "R 0,00");
    assert.equal(moneyCents(1), "R 0,01");
    assert.equal(moneyCents(99), "R 0,99");
    assert.equal(moneyCents(100), "R 1,00");
    assert.equal(moneyCents(123456), "R 1 234,56");
    assert.equal(moneyCents(100000000), "R 1 000 000,00");
    assert.equal(moneyCents(-50), "-R 0,50");
  });

  it("every money string matches the subunit shape", () => {
    const shape = /^-?R [\d ]+,\d{2}$/;
    for (const c of [0, 1, 5, 99, 100, 101, 999, 1000, 123456, 99999999]) {
      assert.match(moneyCents(c), shape);
      assert.match(moneyCents(-c), shape);
    }
  });

  it("rejects non-integers (floats never touch money)", () => {
    assert.throws(() => moneyCents(12.5));
    assert.throws(() => moneyCents(NaN));
  });

  it("moneyLine: exact cents, verbatim seed text, honest fallback", () => {
    assert.equal(
      moneyLine({ id: "a", title: "t", origin: "native", pay_cents: 25000 }),
      "R 250,00",
    );
    assert.equal(
      moneyLine({
        id: "b",
        title: "t",
        origin: "remotiveSeed",
        pay_cents: null,
        pay_text: "$50k - $70k",
      }),
      "$50k - $70k",
    );
    assert.equal(
      moneyLine({ id: "c", title: "t", origin: "native", pay_cents: 0 }),
      "R 0,00",
    );
  });

  it("moneyLine: exact cents win over a stale money string", () => {
    assert.equal(
      moneyLine({ id: "d", title: "t", origin: "native", pay_cents: 25000, money: "R 999,00" }),
      "R 250,00",
    );
    assert.equal(
      moneyLine({ id: "e", title: "t", origin: "native", pay_cents: null, money: "R 5,00" }),
      "R 5,00",
    );
    assert.equal(
      moneyLine({ id: "f", title: "t", origin: "native", pay_cents: 12.5, money: "R 5,00" }),
      "R 5,00",
    );
  });
});
