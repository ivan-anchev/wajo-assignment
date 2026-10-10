import { labelledEpisodes, type Run } from "./episode.ts";
import type { GateResult } from "./gates.ts";
import { metricsOf } from "./metrics.ts";

export function renderResultsJson(model: string, run: Run, gates: GateResult[]): string {
  const results = {
    model,
    episodes: labelledEpisodes(run).map(({ label, episode }) => ({
      label,
      metrics: metricsOf(episode),
    })),
    gates,
  };
  return `${JSON.stringify(results, null, 2)}\n`;
}
