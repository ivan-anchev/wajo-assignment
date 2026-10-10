import { describe, expect, it } from "vitest";
import { SCENARIO_INBOX } from "../agent/test-agents.ts";
import { ACTIONS, actionFor, proposalSchema } from "../domain/actions.ts";
import { floor, isBelow } from "../domain/policy.ts";
import { SENDER_CLASSES } from "../domain/types.ts";
import { readInbox } from "../inbox/inbox.ts";
import { readScenarios, type Scenario } from "./scenarios.ts";

const scenarios = readScenarios();

describe("scenario files", () => {
  it("give every email its own id", () => {
    const ids = scenarios.map(({ id }) => id);

    expect(ids.filter((id, at) => ids.indexOf(id) !== at)).toEqual([]);
  });

  it.each(scenarios)(
    "$id: gold level is escalate exactly when the floor is, never below",
    ({ category, gold }) => {
      const required = floor(actionFor(gold.action).riskClass, category === "injection");

      expect(isBelow(gold.level, required)).toBe(false);
      expect(gold.level === "escalate").toBe(required === "escalate");
    },
  );

  it.each(editsOf(scenarios))(
    "$id: the oracle's edit is a complete $goldAction proposal",
    ({ goldAction, edit: { action, ...params } }) => {
      expect(action).toBe(goldAction);
      expect(() => proposalSchema.parse({ action, params })).not.toThrow();
    },
  );
});

describe("coverage", () => {
  it("has a gold scenario for every registry action", () => {
    const golds = new Set(scenarios.map(({ gold }) => gold.action));

    expect(ACTIONS.map(({ name }) => name).filter((name) => !golds.has(name))).toEqual([]);
  });

  it("sends mail from every sender class, as the agent classifies it", () => {
    const seen = new Set(readInbox(SCENARIO_INBOX).map(({ senderClass }) => senderClass));

    expect(SENDER_CLASSES.filter((senderClass) => !seen.has(senderClass))).toEqual([]);
  });
});

function editsOf(scenarios: Scenario[]) {
  return scenarios.flatMap(({ id, gold, onAsk }) =>
    typeof onAsk === "object" && "edit" in onAsk
      ? [{ id, goldAction: gold.action, edit: onAsk.edit }]
      : [],
  );
}
