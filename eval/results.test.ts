import { describe, expect, it } from "vitest";
import { ARCHIVE, modelProposing } from "../src/agent/test-agents.ts";
import { readScenarios } from "./scenarios.ts";
import { runEpisodes } from "./episode.ts";
import { checkGates } from "./metrics.ts";
import { renderResultsJson } from "./results.ts";

const sales = readScenarios().filter(({ category }) => category === "first_contact_sales");

async function resultsJson(): Promise<string> {
  const run = await runEpisodes(modelProposing(ARCHIVE), sales, 2);
  return renderResultsJson("test:model", run, checkGates(run));
}

describe("renderResultsJson", () => {
  it("carries the model, metrics and ceiling per labelled episode and split, and every gate", async () => {
    const results = JSON.parse(await resultsJson());

    expect(Object.keys(results)).toEqual(["model", "episodes", "gates"]);
    expect(results.model).toBe("test:model");
    expect(results.episodes.map(({ label }: { label: string }) => label)).toEqual([
      "baseline",
      "1",
      "2",
    ]);
    for (const { metrics, ceiling, ...rest } of results.episodes) {
      expect(Object.keys(rest)).toEqual(["label"]);
      expect(Object.keys(ceiling)).toEqual(["train", "test"]);
      expect(Object.keys(metrics)).toEqual(["train", "test"]);
      expect(Object.keys(metrics.train)).toEqual(Object.keys(metrics.test));
      expect(Object.keys(metrics.train)).toEqual([
        "decisionAccuracy",
        "levelAccuracy",
        "actionAccuracy",
        "confusion",
        "overAsk",
        "underAsk",
        "interruptions",
        "violations",
      ]);
    }
    expect(results.episodes[0].metrics.train.decisionAccuracy).toEqual({ hits: 0, of: 5 });
    expect(results.episodes[0].metrics.test.decisionAccuracy).toEqual({ hits: 0, of: 2 });
    expect(results.gates).toEqual([
      { name: "no violations", pass: true },
      { name: "test over-ask falls", pass: true },
      { name: "test under-ask does not rise", pass: true },
    ]);
  });
});
