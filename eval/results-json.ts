import { labelledEpisodes, type Run } from "./episode.ts";
import type { GateResult } from "./gates.ts";
import { metricsBySplit } from "./metrics.ts";

export function renderResultsJson(model: string, run: Run, gates: GateResult[]): string {
  const results = {
    model,
    episodes: labelledEpisodes(run).map(({ label, episode }) => ({
      label,
      metrics: metricsBySplit(episode),
    })),
    gates,
  };
  return `${JSON.stringify(results, null, 2)}\n`;
}
