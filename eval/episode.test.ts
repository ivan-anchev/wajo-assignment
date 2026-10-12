import { describe, expect, it } from "vitest";
import { ARCHIVE, modelProposing, requestsNamed } from "../src/agent/test-agents.ts";
import { readScenarios } from "./scenarios.ts";
import { labelledEpisodes, outcomesIn, runEpisodes, type Episode } from "./episode.ts";

const scenarios = readScenarios();
const sales = scenarios.filter(
  ({ category, split }) => category === "first_contact_sales" && split === "train",
);
const news6 = scenarios.filter(({ id }) => id === "news-6");
const salesBucket = scenarios.filter(({ id }) => id === "sales-1" || id === "t-sales-1");
const arrivingOutOfOrder = scenarios.filter(({ id }) => id === "fyi-1" || id === "news-1");

function levels(episode: Episode) {
  return episode.map(({ transcript }) => transcript.decision.level);
}

describe("runEpisodes", () => {
  it("answers each email before the next arrives, so one episode's feedback moves its own levels", async () => {
    const { episodes } = await runEpisodes(modelProposing(ARCHIVE), sales, 2);

    expect(sales).toHaveLength(5);
    expect(episodes.map(levels)).toEqual([
      ["notify", "notify", "silent", "silent", "silent"],
      ["silent", "silent", "silent", "silent", "silent"],
    ]);
  });

  it("decides every baseline email at cold start, answers nothing, and writes no feedback", async () => {
    const { baseline } = await runEpisodes(modelProposing(ARCHIVE), sales, 1);

    expect(levels(baseline)).toEqual(sales.map(() => "notify"));
    expect(baseline.map(({ transcript }) => transcript.item!.status)).toEqual(
      sales.map(() => "open"),
    );
    expect(baseline.map(({ transcript }) => transcript.feedback)).toEqual(sales.map(() => null));
  });

  it("decides a held-out email at the level its bucket learned on train, and never answers it", async () => {
    const { baseline, episodes } = await runEpisodes(modelProposing(ARCHIVE), salesBucket, 3);

    expect(levels(outcomesIn(baseline, "test"))).toEqual(["notify"]);
    expect(episodes.map((episode) => levels(outcomesIn(episode, "test")))).toEqual([
      ["notify"],
      ["silent"],
      ["silent"],
    ]);
    expect(
      episodes.flatMap((episode) =>
        outcomesIn(episode, "test").map(({ transcript }) => [
          transcript.item?.status ?? null,
          transcript.feedback,
        ]),
      ),
    ).toEqual([
      ["open", null],
      [null, null],
      [null, null],
    ]);
  });

  it("pairs every outcome with its scenario, in scenario order, under a labelled email id", async () => {
    const run = await runEpisodes(modelProposing(ARCHIVE), arrivingOutOfOrder, 2);

    expect(
      labelledEpisodes(run).map(({ label, episode }) => [
        label,
        episode.map(({ scenario, transcript }) => [scenario.id, transcript.email.id]),
      ]),
    ).toEqual([
      [
        "baseline",
        [
          ["fyi-1", "fyi-1@baseline"],
          ["news-1", "news-1@baseline"],
        ],
      ],
      [
        "1",
        [
          ["fyi-1", "fyi-1@e1"],
          ["news-1", "news-1@e1"],
        ],
      ],
      [
        "2",
        [
          ["fyi-1", "fyi-1@e2"],
          ["news-1", "news-1@e2"],
        ],
      ],
    ]);
  });

  it("carries preference text into the next episode's analysis, never into the baseline", async () => {
    const llm = modelProposing(ARCHIVE, { preferences: ["Investor letters stay in my inbox."] });

    const { preferences } = await runEpisodes(llm, news6, 2);

    expect(preferences).toContain("Investor letters stay in my inbox.");
    const analyses = requestsNamed(llm, "analysis");
    expect(analyses).toHaveLength(3);
    const [baseline, first, second] = analyses;
    expect(baseline).not.toContain("Investor letters stay");
    expect(first).not.toContain("Investor letters stay");
    expect(second).toContain("Investor letters stay");
  });
});
