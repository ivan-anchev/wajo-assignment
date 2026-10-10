import { describe, expect, it } from "vitest";
import { SCENARIO_INBOX } from "../agent/test-agents.ts";
import { ACTIONS, proposalSchema } from "../domain/actions.ts";
import { SENDER_CLASSES } from "../domain/types.ts";
import { readInbox } from "../inbox/inbox.ts";
import { correctedParams, readScenarios } from "./scenarios.ts";

const scenarios = readScenarios();

describe("scenario files", () => {
  it("give every email its own id", () => {
    const ids = scenarios.map(({ id }) => id);

    expect(ids.filter((id, at) => ids.indexOf(id) !== at)).toEqual([]);
  });

  it.each(scenarios.filter(({ correction }) => correction && "params" in correction))(
    "$id: correction.params complete a $gold.action proposal",
    (scenario) => {
      const proposal = { action: scenario.gold.action, params: correctedParams(scenario) };

      expect(() => proposalSchema.parse(proposal)).not.toThrow();
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
