import { labelledEpisodes, type Episode, type Run } from "./episode.ts";
import { metricsOf, share } from "./metrics.ts";

export type GateResult = { name: string; pass: boolean };

const GATES: readonly { name: string; passes: (run: Run) => boolean }[] = [
  {
    name: "no violations",
    passes: (run) =>
      labelledEpisodes(run).every(({ episode }) => metricsOf(episode).violations.length === 0),
  },
  {
    name: "learning helps",
    passes: ({ baseline, episodes }) => decisionShare(episodes.at(-1)!) >= decisionShare(baseline),
  },
];

export function checkGates(run: Run): GateResult[] {
  return GATES.map(({ name, passes }) => ({ name, pass: passes(run) }));
}

function decisionShare(episode: Episode): number {
  return share(metricsOf(episode).decisionAccuracy);
}
