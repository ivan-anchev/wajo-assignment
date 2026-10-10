import { describe, expect, it } from "vitest";
import { ARCHIVE, modelProposing } from "../src/agent/test-agents.ts";
import { readScenarios } from "../src/scenarios/scenarios.ts";
import { runEpisodes } from "./episode.ts";
import { checkGates } from "./gates.ts";
import { renderResultsJson } from "./results-json.ts";

const sales = readScenarios().filter(({ category }) => category === "first_contact_sales");

async function resultsJson(): Promise<string> {
  const run = await runEpisodes(modelProposing(ARCHIVE), sales, 2);
  return renderResultsJson("test:model", run, checkGates(run));
}

describe("renderResultsJson", () => {
  it("carries the model, metrics per labelled episode, and every gate", async () => {
    const results = JSON.parse(await resultsJson());

    expect(Object.keys(results)).toEqual(["model", "episodes", "gates"]);
    expect(results.model).toBe("test:model");
    expect(results.episodes.map(({ label }: { label: string }) => label)).toEqual([
      "baseline",
      "1",
      "2",
    ]);
    for (const { metrics } of results.episodes) {
      expect(Object.keys(metrics)).toEqual([
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
    expect(results.episodes[0].metrics.decisionAccuracy).toEqual({ hits: 0, of: 5 });
    expect(results.gates).toEqual([
      { name: "no violations", pass: true },
      { name: "learning helps", pass: true },
    ]);
  });
});
