import { describe, expect, it } from "vitest";
import { ARCHIVE, modelProposing, requestsNamed } from "../src/agent/test-agents.ts";
import { readScenarios } from "../src/scenarios/scenarios.ts";
import { runEpisodes, type Episode } from "./episode.ts";

const scenarios = readScenarios();
const sales = scenarios.filter(({ category }) => category === "first_contact_sales");
const news6 = scenarios.filter(({ id }) => id === "news-6");
const arrivingOutOfOrder = scenarios.filter(({ id }) => id === "fyi-1" || id === "news-1");

function levels(episode: Episode) {
  return episode.map(({ transcript }) => transcript.decision.level);
}

describe("runEpisodes", () => {
  it("carries feedback across episodes so the bucket climbs ask -> notify -> silent", async () => {
    const { episodes } = await runEpisodes(modelProposing(ARCHIVE), sales, 3);

    expect(episodes.map(levels)).toEqual(
      ["ask", "notify", "silent"].map((level) => sales.map(() => level)),
    );
  });

  it("pairs every outcome with its scenario, in scenario order, under an episode email id", async () => {
    const { episodes } = await runEpisodes(modelProposing(ARCHIVE), arrivingOutOfOrder, 2);

    expect(
      episodes[1]!.map(({ scenario, transcript }) => [scenario.id, transcript.email.id]),
    ).toEqual([
      ["fyi-1", "fyi-1@e2"],
      ["news-1", "news-1@e2"],
    ]);
  });

  it("carries preference text into the next episode's analysis", async () => {
    const llm = modelProposing(ARCHIVE, { preference: "Investor letters stay in my inbox." });

    const { preferences } = await runEpisodes(llm, news6, 2);

    expect(preferences).toContain("Investor letters stay in my inbox.");
    const analyses = requestsNamed(llm, "analysis");
    expect(analyses).toHaveLength(2);
    expect(analyses[0]).not.toContain("Investor letters stay");
    expect(analyses[1]).toContain("Investor letters stay");
  });
});
