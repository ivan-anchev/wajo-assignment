import type { LanguageModel } from "ai";
import { readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderTranscript } from "../src/cli/render.ts";
import { readScenarios } from "../src/scenarios/scenarios.ts";
import { labelledEpisodes, runEpisodes, type Outcome, type Run } from "./episode.ts";
import { checkGates } from "./gates.ts";
import { scoreOutcome } from "./metrics.ts";
import { renderResultsJson } from "./results-json.ts";
import { renderResults, renderSummary } from "./results.ts";

const RESULTS_PATH = fileURLToPath(new URL("../RESULTS.md", import.meta.url));
const RESULTS_JSON_PATH = fileURLToPath(new URL("../results.json", import.meta.url));
const TRANSCRIPT_DIR = fileURLToPath(new URL("../transcripts", import.meta.url));

type EvalOptions = { episodes: number; model: string };
type Evaluation = { report: string; passed: boolean };

export async function evaluate(
  llm: LanguageModel,
  { episodes, model }: EvalOptions,
): Promise<Evaluation> {
  const run = await runEpisodes(llm, readScenarios(), episodes);
  const gates = checkGates(run);
  writeFileSync(RESULTS_PATH, renderResults(run, gates));
  writeFileSync(RESULTS_JSON_PATH, renderResultsJson(model, run, gates));
  const written = writeTranscripts(run);
  return {
    report: `${renderSummary(run, gates)}\n\nWrote RESULTS.md, results.json and ${written} transcripts.`,
    passed: gates.every(({ pass }) => pass),
  };
}

function writeTranscripts(run: Run): number {
  clearTranscripts();
  const finalEpisode = run.episodes.at(-1)!;
  for (const outcome of finalEpisode) {
    writeTranscript(outcome.scenario.id, outcome);
  }
  const violating = violatingOutcomes(run);
  for (const outcome of violating) {
    writeTranscript(outcome.transcript.email.id, outcome);
  }
  return finalEpisode.length + violating.length;
}

function clearTranscripts(): void {
  for (const name of readdirSync(TRANSCRIPT_DIR).filter((file) => file.endsWith(".txt"))) {
    rmSync(join(TRANSCRIPT_DIR, name));
  }
}

function violatingOutcomes(run: Run): Outcome[] {
  return labelledEpisodes(run)
    .flatMap(({ episode }) => episode)
    .filter((outcome) => scoreOutcome(outcome).violations.length > 0);
}

function writeTranscript(name: string, outcome: Outcome): void {
  const { reason } = scoreOutcome(outcome);
  writeFileSync(
    join(TRANSCRIPT_DIR, `${name}.txt`),
    `${renderTranscript(outcome.transcript)}\n\nScore: ${reason}\n`,
  );
}
