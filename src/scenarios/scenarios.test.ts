import { describe, expect, it } from "vitest";
import { SCENARIO_INBOX } from "../agent/test-agents.ts";
import { ACTIONS, proposalSchema } from "../domain/actions.ts";
import { SENDER_CLASSES } from "../domain/types.ts";
import { readInbox } from "../inbox/inbox.ts";
import { correctedParams, readScenarios, type Scenario } from "./scenarios.ts";

const scenarios = readScenarios();
const senderClasses = new Map(
  readInbox(SCENARIO_INBOX).map(({ id, senderClass }) => [id, senderClass]),
);
const train = scenarios.filter(({ split }) => split === "train");
const test = scenarios.filter(({ split }) => split === "test");

function bucketOf({ id, gold }: Scenario): string {
  return `${gold.action} × ${senderClasses.get(id)} → ${gold.level}`;
}

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

describe("train coverage", () => {
  it("has a gold scenario for every registry action", () => {
    const golds = new Set(train.map(({ gold }) => gold.action));

    expect(ACTIONS.map(({ name }) => name).filter((name) => !golds.has(name))).toEqual([]);
  });
});

describe.each([
  { split: "train", members: train },
  { split: "test", members: test },
])("$split coverage", ({ members }) => {
  it("sends mail from every sender class, as the agent classifies it", () => {
    const seen = new Set(members.map(({ id }) => senderClasses.get(id)));

    expect(SENDER_CLASSES.filter((senderClass) => !seen.has(senderClass))).toEqual([]);
  });
});

describe("held-out test split", () => {
  it("puts every test scenario in a bucket the train split teaches, at the level it settles at", () => {
    const trained = new Set(train.map(bucketOf));

    expect(test.map(bucketOf).filter((bucket) => !trained.has(bucket))).toEqual([]);
  });

  it("holds out at least one scenario of every category", () => {
    const heldOut = new Set(test.map(({ category }) => category));

    expect(
      [...new Set(train.map(({ category }) => category))].filter((c) => !heldOut.has(c)),
    ).toEqual([]);
  });
});
