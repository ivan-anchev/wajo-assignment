import { CATEGORIES, type Scenario } from "./scenarios.ts";
import type { Episode, LabelledEpisode } from "./episode.ts";
import { percent, table } from "./markdown.ts";
import { metricsBySplit } from "./metrics.ts";

export function renderCategories({ episode }: LabelledEpisode): string {
  const present = CATEGORIES.filter((category) => outcomesOf(episode, category).length > 0);
  return [
    "## Decision accuracy per category, final episode",
    "Both the proposed action and the level must match gold.",
    table(
      ["Category", "Train", "Test"],
      present.map((category) => categoryRow(episode, category)),
    ),
  ].join("\n\n");
}

function categoryRow(episode: Episode, category: Scenario["category"]): string[] {
  const { train, test } = metricsBySplit(outcomesOf(episode, category));
  return [category, percent(train.decisionAccuracy), percent(test.decisionAccuracy)];
}

function outcomesOf(episode: Episode, category: Scenario["category"]): Episode {
  return episode.filter(({ scenario }) => scenario.category === category);
}
