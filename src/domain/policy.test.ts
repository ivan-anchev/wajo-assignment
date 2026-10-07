import { describe, expect, it } from "vitest";
import { ACTIONS, type ActionName } from "./actions.ts";
import { floor } from "./policy.ts";
import type { Level } from "./types.ts";

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
