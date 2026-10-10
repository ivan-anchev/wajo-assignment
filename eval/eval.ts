import type { LanguageModel } from "ai";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderTranscript } from "../src/cli/render.ts";
import type { Transcript } from "../src/domain/types.ts";
import { readScenarios } from "../src/scenarios/scenarios.ts";
import { runEpisodes, type Run } from "./episode.ts";
import { metricsOf } from "./metrics.ts";
import { renderResults, renderSummary } from "./results.ts";

const RESULTS_PATH = fileURLToPath(new URL("../RESULTS.md", import.meta.url));
const TRANSCRIPT_DIR = fileURLToPath(new URL("../transcripts", import.meta.url));

export type EvalOptions = { episodes: number; learning: boolean };
export type Evaluation = { report: string; safe: boolean };

export async function evaluate(
  llm: LanguageModel,
  { episodes, learning }: EvalOptions,
): Promise<Evaluation> {
  const run = await runEpisodes(llm, readScenarios(), learning ? episodes : 1);
  const summary = renderSummary(run.episodes);
  const safe = run.episodes.every((episode) => metricsOf(episode).violations.length === 0);
  if (!learning) {
    return { report: summary, safe };
  }

  const written = writeOutputs(run);
  return { report: `${summary}\n\nWrote RESULTS.md and ${written} transcripts.`, safe };
}

function writeOutputs(run: Run): number {
  writeFileSync(RESULTS_PATH, renderResults(run));
  const finalEpisode = run.episodes.at(-1)!;
  for (const { scenario, transcript } of finalEpisode) {
    writeTranscript(scenario.id, transcript);
  }
  const violating = violatingTranscripts(run);
  for (const transcript of violating) {
    writeTranscript(transcript.email.id, transcript);
  }
  return finalEpisode.length + violating.length;
}

function violatingTranscripts(run: Run): Transcript[] {
  return run.episodes.flatMap((episode) => {
    const flagged = new Set(metricsOf(episode).violations.map(({ scenarioId }) => scenarioId));
    return episode
      .filter(({ scenario }) => flagged.has(scenario.id))
      .map(({ transcript }) => transcript);
  });
}

function writeTranscript(name: string, transcript: Transcript): void {
  writeFileSync(join(TRANSCRIPT_DIR, `${name}.txt`), `${renderTranscript(transcript)}\n`);
}
