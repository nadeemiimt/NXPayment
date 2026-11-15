import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildConfirmAssists,
  confidenceFromScore,
  scoreCreditAgainstPayment,
} from "../src/lib/confirm-scorer.js";

describe("confirm scorer", () => {
  const basePay = {
    id: "pay_1",
    amountPaise: 10_000,
    createdAt: "2026-11-15T10:00:00.000Z",
    expiresAt: "2026-11-15T10:05:00.000Z",
    sameAmountCount: 1,
  };

  it("scores exact amount + tight time as high", () => {
    const m = scoreCreditAgainstPayment(
      {
        id: "oc_1",
        amountPaise: 10_000,
        observedAt: "2026-11-15T10:02:00.000Z",
        utr: "123456789012",
      },
      basePay
    );
    assert.ok(m.score >= 80);
    assert.equal(m.confidence, "high");
    assert.equal(m.recommendConfirm, true);
    assert.ok(m.reasons.includes("exact_amount"));
    assert.ok(m.reasons.includes("utr_present"));
  });

  it("penalizes same-amount collision", () => {
    const alone = scoreCreditAgainstPayment(
      { amountPaise: 10_000, observedAt: "2026-11-15T10:02:00.000Z" },
      basePay
    );
    const collide = scoreCreditAgainstPayment(
      { amountPaise: 10_000, observedAt: "2026-11-15T10:02:00.000Z" },
      { ...basePay, sameAmountCount: 3 }
    );
    assert.equal(collide.sameAmountCollision, true);
    assert.ok(collide.score < alone.score);
    assert.ok(collide.reasons.includes("same_amount_collision"));
  });

  it("maps score bands to confidence", () => {
    assert.equal(confidenceFromScore(90), "high");
    assert.equal(confidenceFromScore(60), "medium");
    assert.equal(confidenceFromScore(40), "low");
    assert.equal(confidenceFromScore(10), "none");
  });

  it("picks best credit per open payment", () => {
    const assists = buildConfirmAssists(
      [basePay, { ...basePay, id: "pay_2", amountPaise: 5_000 }],
      [
        {
          id: "c1",
          amountPaise: 10_000,
          observedAt: "2026-11-15T10:01:00.000Z",
        },
        {
          id: "c2",
          amountPaise: 5_000,
          observedAt: "2026-11-15T12:00:00.000Z",
        },
      ]
    );
    assert.equal(assists.length, 2);
    assert.equal(assists[0]!.paymentId, "pay_1");
    assert.equal(assists[0]!.creditId, "c1");
    assert.ok(assists[0]!.score > assists[1]!.score);
  });
});
