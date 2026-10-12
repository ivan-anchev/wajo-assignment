import { describe, expect, it } from "vitest";
import { ACTIONS, type ActionName } from "./actions.ts";
import {
  floor,
  isBelow,
  LEVELS,
  levelFor,
  promotion,
  type Analysis,
  type FeedbackKind,
  type Level,
} from "./policy.ts";

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

const CLEAN = { suspected: false, evidence: [] };
const TRIPPED = { suspected: true, evidence: ["pattern: x"] };

describe("floor", () => {
  it.each(ACTIONS)("$name floors at its risk-class level", ({ name }) => {
    expect(floor([name], [])).toBe(EXPECTED_FLOOR[name]);
  });

  it.each(ACTIONS)("$name escalates when injection is suspected", ({ name }) => {
    expect(floor([name, "none"], [TRIPPED, CLEAN])).toBe("escalate");
  });

  it.each(ACTIONS)("$name escalates when payment is suspected", ({ name }) => {
    expect(floor([name, "none"], [CLEAN, TRIPPED])).toBe("escalate");
  });

  it("takes the strictest of the proposed and requested actions, in either order", () => {
    expect(floor(["label", "pay_invoice"], [])).toBe("escalate");
    expect(floor(["pay_invoice", "label"], [])).toBe("escalate");
    expect(floor(["send_reply", "none"], [])).toBe("ask");
  });
});
const RESPONSES: FeedbackKind[] = ["approve", "edit", "redirect", "reject", "dismiss", "undo"];

const learned = (...history: FeedbackKind[]) =>
  levelFor(analysisOf("archive"), [], history, null).learned;
const twice = (response: FeedbackKind) => [response, response];

describe("learned level (§7.1)", () => {
  it.each<[string, FeedbackKind[], Level]>([
    ["starts at ask", [], "ask"],
    ["needs two consecutive positives", ["approve"], "ask"],
    ["moves to notify after two approves", twice("approve"), "notify"],
    ["needs two dismisses at notify", [...twice("approve"), "dismiss"], "notify"],
    ["resets the streak on edit", ["approve", "edit", "approve"], "ask"],
    ["resets the streak on reject", ["approve", "reject", "approve"], "ask"],
    ["keeps ask on a reject at cold start", ["reject"], "ask"],
    [
      "moves to silent after two dismisses at notify",
      [...twice("approve"), ...twice("dismiss")],
      "silent",
    ],
    ["ignores dismisses at ask", [...twice("dismiss"), "approve"], "ask"],
    [
      "ignores approves at notify, without resetting",
      [...twice("approve"), "dismiss", "approve", "dismiss"],
      "silent",
    ],
    [
      "steps silent back to notify on undo",
      [...twice("approve"), ...twice("dismiss"), "undo"],
      "notify",
    ],
    [
      "ignores dismisses at silent",
      [...twice("approve"), ...twice("dismiss"), "dismiss"],
      "silent",
    ],
    ["steps notify back to ask on reject", [...twice("approve"), "reject"], "ask"],
    ["steps notify back to ask on edit", [...twice("approve"), "edit"], "ask"],
    ["needs a fresh streak after a step back", [...twice("approve"), "reject", "approve"], "ask"],
  ])("%s", (_, history, expected) => {
    expect(learned(...history)).toBe(expected);
  });

  it("an edit to another action leaves the standing unchanged", () => {
    expect(learned("approve", "redirect", "approve")).toBe("notify");
    expect(learned(...twice("approve"), "redirect")).toBe("notify");
    expect(learned(...twice("approve"), "dismiss", "redirect", "dismiss")).toBe("silent");
  });

  it("a param-only edit is still a negative", () => {
    expect(learned("approve", "edit", "approve")).toBe("ask");
    expect(learned(...twice("approve"), "edit")).toBe("ask");
  });
});

describe("levelFor", () => {
  it("raises the floor to the requested action, never lowers it", () => {
    const promoted = [...twice("approve"), ...twice("dismiss")];

    expect(levelFor(analysisOf("label", "pay_invoice"), [], promoted, null)).toMatchObject({
      floor: "escalate",
      level: "escalate",
    });
    expect(levelFor(analysisOf("archive", "send_reply"), [], promoted, null)).toMatchObject({
      floor: "ask",
      level: "ask",
    });
    expect(levelFor(analysisOf("send_reply"), [], promoted, null)).toMatchObject({
      floor: "ask",
      level: "ask",
    });
  });

  it("holds an inert proposal at the requested floor", () => {
    expect(levelFor(analysisOf("none", "pay_invoice"), [], [], null)).toMatchObject({
      floor: "escalate",
      level: "escalate",
    });
  });

  it("never learns an inert action", () => {
    expect(levelFor(analysisOf("none"), [], ["reject"], null)).toEqual({
      floor: "silent",
      learned: "silent",
      level: "silent",
    });
    expect(levelFor(analysisOf("none"), [], ["reject"], "ask").level).toBe("ask");
  });

  it.each<[Level | null, Level]>([
    ["silent", "notify"],
    ["escalate", "escalate"],
    [null, "notify"],
  ])("joins pin %s with learned", (pin, level) => {
    expect(levelFor(analysisOf("archive"), [], twice("approve"), pin)).toMatchObject({
      learned: "notify",
      level,
    });
  });

  it("never decides below the floor, for any feedback history or pin (invariants 1 and 4)", () => {
    const violations = [];
    for (const pin of [null, ...LEVELS]) {
      for (const history of historiesUpTo(4)) {
        for (const { name } of ACTIONS) {
          for (const suspected of [false, true]) {
            const injection = { suspected, evidence: [] };
            const decided = levelFor(analysisOf(name), [injection], history, pin);
            if (isBelow(decided.level, decided.floor)) {
              violations.push({ name, suspected, history, pin });
            }
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe("promotion (§7.2)", () => {
  it("fires only on the response that crosses the threshold", () => {
    expect(promotion("archive", [], "approve", null)).toBeNull();
    expect(promotion("archive", ["approve"], "approve", null)).toBe("ask");
    expect(promotion("archive", twice("approve"), "approve", null)).toBeNull();
  });

  it("is not announced when the floor hides it", () => {
    expect(promotion("send_reply", ["approve"], "approve", null)).toBeNull();
  });

  it("is never a demotion", () => {
    expect(
      promotion("archive", [...twice("approve"), ...twice("dismiss")], "undo", null),
    ).toBeNull();
  });

  it("is not announced while a pin holds the bucket at or above the old level", () => {
    expect(promotion("archive", ["approve"], "approve", "ask")).toBeNull();
    expect(promotion("archive", ["approve"], "approve", "notify")).toBe("ask");
  });
});

function analysisOf(action: ActionName, requested: ActionName = "none"): Analysis {
  return { summary: "s", intent: "i", proposal: { action, params: {} }, requested };
}

function historiesUpTo(maxLength: number): FeedbackKind[][] {
  let layer: FeedbackKind[][] = [[]];
  const all = [...layer];
  for (let n = 0; n < maxLength; n++) {
    layer = layer.flatMap((history) => RESPONSES.map((response) => [...history, response]));
    all.push(...layer);
  }
  return all;
}
