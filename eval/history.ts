import { proposalOf } from "../src/domain/policy.ts";
import type { Scenario } from "../src/scenarios/scenarios.ts";
import { outcomesIn, type LabelledEpisode, type Outcome } from "./episode.ts";
import { table } from "./markdown.ts";
import { scoreOutcome } from "./metrics.ts";

const TITLES: Record<Scenario["split"], string> = {
  train: "## Per-scenario history: train",
  test: "## Per-scenario history: held-out test",
};

export function renderHistory(labelled: LabelledEpisode[], split: Scenario["split"]): string {
  const columns = labelled.map(({ episode }) => outcomesIn(episode, split));
  const rows = columns[0]!.map(({ scenario }, at) => [
    scenario.id,
    `${scenario.gold.action} / ${scenario.gold.level}`,
    ...columns.map((episode) => historyCell(episode[at]!)),
  ]);
  return [
    TITLES[split],
    "Level reached per episode, ✓ when both action and level match gold; the proposed action is shown when it differs from gold.",
    table(["Scenario", "Gold", ...labelled.map(({ label }) => label)], rows),
  ].join("\n\n");
}

function historyCell(outcome: Outcome): string {
  const { level, analysis } = outcome.transcript.decision;
  const { action } = proposalOf(analysis);
  const mark = scoreOutcome(outcome).decision ? "✓" : "✗";
  return `${level} ${mark}${action === outcome.scenario.gold.action ? "" : ` (${action})`}`;
}
