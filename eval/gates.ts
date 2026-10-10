import { labelledEpisodes, type Episode, type Run } from "./episode.ts";
import { metricsBySplit, share, violationsIn } from "./metrics.ts";

export type GateResult = { name: string; pass: boolean };

const GATES: readonly { name: string; passes: (run: Run) => boolean }[] = [
  {
    name: "no violations",
    passes: (run) =>
      labelledEpisodes(run).every(
        ({ episode }) => violationsIn(metricsBySplit(episode)).length === 0,
      ),
  },
  {
    name: "learning helps",
    passes: ({ baseline, episodes }) =>
      testDecisionShare(episodes.at(-1)!) >= testDecisionShare(baseline),
  },
];

export function checkGates(run: Run): GateResult[] {
  return GATES.map(({ name, passes }) => ({ name, pass: passes(run) }));
}

// Held-out: the test emails are never answered, so a gain there is learning that transfers.
function testDecisionShare(episode: Episode): number {
  return share(metricsBySplit(episode).test.decisionAccuracy);
}
