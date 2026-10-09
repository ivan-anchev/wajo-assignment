import { describe, expect, it } from "vitest";
import { ACTIONS, type ActionName } from "./actions.ts";
import { floor, levelFor } from "./policy.ts";
import { LEVELS, type Analysis, type ItemResponse, type Level } from "./types.ts";

// Keyed by action, not risk class, so a misclassified action fails here.
const EXPECTED_FLOOR: Record<ActionName, Level> = {
  none: "silent",
  archive: "silent",
  mark_read: "silent",
  snooze: "silent",
  label: "silent",
  draft_reply: "silent",
  send_reply: "ask",
  forward: "ask",
  unsubscribe: "ask",
  delete_permanently: "ask",
  pay_invoice: "escalate",
};

describe("floor", () => {
  it.each(ACTIONS)("$name floors at its risk-class level", (action) => {
    expect(floor(action.riskClass, false)).toBe(EXPECTED_FLOOR[action.name]);
  });

  it.each(ACTIONS)("$name escalates when injection is suspected", (action) => {
    expect(floor(action.riskClass, true)).toBe("escalate");
  });
});

const CLEAN = { suspected: false, evidence: [] };
const RESPONSES: ItemResponse[] = ["approve", "edit", "reject", "dismiss", "undo"];

const learned = (...history: ItemResponse[]) =>
  levelFor(analysisOf("archive"), CLEAN, history).learned;
const thrice = (response: ItemResponse) => [response, response, response];

describe("learned level (§7.1)", () => {
  it.each<[string, ItemResponse[], Level]>([
    ["starts at ask", [], "ask"],
    ["needs three consecutive positives", ["approve", "approve"], "ask"],
    ["moves to notify after three approves", thrice("approve"), "notify"],
    ["counts edit as an approve", ["approve", "edit", "approve"], "notify"],
    ["resets the streak on reject", ["approve", "approve", "reject", "approve"], "ask"],
    ["keeps ask on a reject at cold start", ["reject"], "ask"],
    [
      "moves to silent after three dismisses at notify",
      [...thrice("approve"), ...thrice("dismiss")],
      "silent",
    ],
    ["ignores dismisses at ask", [...thrice("dismiss"), "approve"], "ask"],
    [
      "ignores approves at notify, without resetting",
      [...thrice("approve"), "dismiss", "approve", "dismiss", "dismiss"],
      "silent",
    ],
    [
      "steps silent back to notify on undo",
      [...thrice("approve"), ...thrice("dismiss"), "undo"],
      "notify",
    ],
    [
      "ignores dismisses at silent",
      [...thrice("approve"), ...thrice("dismiss"), "dismiss"],
      "silent",
    ],
    ["steps notify back to ask on reject", [...thrice("approve"), "reject"], "ask"],
    [
      "needs a fresh streak after a step back",
      [...thrice("approve"), "reject", "approve", "approve"],
      "ask",
    ],
  ])("%s", (_, history, expected) => {
    expect(learned(...history)).toBe(expected);
  });
});

describe("levelFor", () => {
  it("brakes below 0.6 by one rung", () => {
    expect(levelFor(analysisOf("archive", 0.59), CLEAN, thrice("approve"))).toEqual({
      floor: "silent",
      learned: "notify",
      brake: true,
      level: "ask",
    });
  });

  it("does not brake at exactly 0.6", () => {
    expect(levelFor(analysisOf("archive", 0.6), CLEAN, thrice("approve")).brake).toBe(false);
  });

  it("caps the brake at ask", () => {
    expect(levelFor(analysisOf("archive", 0.1), CLEAN, []).level).toBe("ask");
  });

  it("never learns or brakes an inert action", () => {
    expect(levelFor(analysisOf("none", 0.1), CLEAN, ["reject"])).toEqual({
      floor: "silent",
      learned: "silent",
      brake: false,
      level: "silent",
    });
  });

  it("never decides below the floor, for any feedback history (invariant 1)", () => {
    const violations = [];
    for (const history of historiesUpTo(4)) {
      for (const { name } of ACTIONS) {
        for (const confidence of [0.3, 0.9]) {
          for (const suspected of [false, true]) {
            const injection = { suspected, evidence: [] };
            const decided = levelFor(analysisOf(name, confidence), injection, history);
            if (rank(decided.level) < rank(decided.floor)) {
              violations.push({ name, confidence, suspected, history });
            }
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

function analysisOf(action: ActionName, confidence = 0.9): Analysis {
  return {
    summary: "s",
    intent: "i",
    proposal: { action, params: {} },
    confidence,
  };
}

function historiesUpTo(maxLength: number): ItemResponse[][] {
  let layer: ItemResponse[][] = [[]];
  const all = [...layer];
  for (let n = 0; n < maxLength; n++) {
    layer = layer.flatMap((history) => RESPONSES.map((response) => [...history, response]));
    all.push(...layer);
  }
  return all;
}

function rank(level: Level): number {
  return LEVELS.indexOf(level);
}
