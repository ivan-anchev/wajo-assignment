import { describe, expect, it } from "vitest";
import type { Proposal } from "../src/domain/actions.ts";
import { levelFor } from "../src/domain/policy.ts";
import type { ItemResponse, Level } from "../src/domain/types.ts";
import { correctedParams, readScenarios, type Scenario } from "../src/scenarios/scenarios.ts";
import { replyTo } from "./oracle.ts";

// Enough rounds for cold start to cross both promotion streaks, then hold for longer than a
// streak, so a level partway through its streak cannot pass as resting.
const ROUNDS = 12;
const RESTING = 4;

describe("gold levels", () => {
  it.each(readScenarios())(
    "$id: $gold.level is a fixed point of the ladder under the oracle",
    (scenario) => {
      const levels = levelsUnderOracle(scenario);

      expect(levels.slice(-RESTING)).toEqual(Array(RESTING).fill(scenario.gold.level));
    },
  );
});

function levelsUnderOracle(scenario: Scenario): Level[] {
  const proposal = goldProposal(scenario);
  const analysis = { summary: "", intent: "", proposal, requested: "none", confidence: 1 } as const;
  const injection = { suspected: scenario.category === "injection", evidence: [] };
  const history: ItemResponse[] = [];
  const levels: Level[] = [];
  for (let round = 0; round < ROUNDS; round++) {
    const { level } = levelFor(analysis, injection, history, null);
    levels.push(level);
    history.push(...feedbackAt(level, proposal, scenario));
  }
  return levels;
}

function goldProposal(scenario: Scenario): Proposal {
  return { action: scenario.gold.action, params: correctedParams(scenario) };
}

// Silent creates no item, and dismissing an escalation is never feedback.
function feedbackAt(level: Level, proposal: Proposal, scenario: Scenario): ItemResponse[] {
  if (level === "silent" || level === "escalate") {
    return [];
  }
  return [replyTo({ kind: level, proposal }, scenario).response];
}
