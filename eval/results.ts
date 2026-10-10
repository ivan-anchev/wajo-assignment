import { LEVELS } from "../src/domain/types.ts";
import type { Episode, Outcome, Run } from "./episode.ts";
import { metricsOf, type Confusion, type Metrics, type Ratio } from "./metrics.ts";

const INTRO = [
  "# Eval results",
  "",
  "A scripted user answers every item the agent opens, following each scenario's `onAsk` and",
  "`onNotify` verbatim; escalations are dismissed, which teaches nothing. Learned state carries",
  "across episodes, and what an episode teaches shows from the next one. Gold levels are the",
  "persona's steady state, so cold-start asks count as over-asks.",
  "",
  "Episode 1 is the no-learning baseline: it runs on a fresh database, and with recorded LLM",
  "responses every episode without learning is identical to it. Regenerate with `pnpm agent eval`.",
].join("\n");

export function renderResults(run: Run): string {
  const sections = [
    INTRO,
    renderSummary(run.episodes),
    renderHistory(run.episodes),
    renderPreferences(run.preferences),
    ...run.episodes.map((episode, at) => renderEpisode(at, episode)),
  ];
  return `${sections.join("\n\n")}\n`;
}

export function renderSummary(episodes: Episode[]): string {
  const metrics = episodes.map(metricsOf);
  const violations = metrics.flatMap((m, at) =>
    m.violations.map(
      ({ scenarioId, reason }) => `- ${episodeLabel(at)}, **${scenarioId}**: ${reason}`,
    ),
  );
  return [
    "## Summary",
    table(
      [
        "Episode",
        "Level acc",
        "Action acc",
        "Over-ask",
        "Under-ask",
        "Interruptions",
        "Violations",
      ],
      metrics.map((m, at) => summaryRow(episodeLabel(at), m)),
    ),
    ...(violations.length ? [violations.join("\n")] : []),
  ].join("\n\n");
}

function summaryRow(label: string, m: Metrics): string[] {
  return [
    label,
    percent(m.levelAccuracy),
    percent(m.actionAccuracy),
    percent(m.overAsk),
    percent(m.underAsk),
    `${m.interruptions}`,
    `${m.violations.length}`,
  ];
}

function renderHistory(episodes: Episode[]): string {
  const rows = episodes[0]!.map(({ scenario }, at) => [
    scenario.id,
    `${scenario.gold.action} / ${scenario.gold.level}`,
    ...episodes.map((episode) => historyCell(episode[at]!)),
  ]);
  return [
    "## Per-scenario history",
    "Level reached per episode; the proposed action is shown when it differs from gold.",
    table(["Scenario", "Gold", ...episodes.map((_, at) => `E${at + 1}`)], rows),
  ].join("\n\n");
}

function historyCell({ scenario, transcript: { decision } }: Outcome): string {
  const mark = decision.level === scenario.gold.level ? "✓" : "✗";
  const action = decision.analysis.proposal.action;
  return `${decision.level} ${mark}${action === scenario.gold.action ? "" : ` (${action})`}`;
}

function renderPreferences(preferences: string): string {
  const lines = preferences ? preferences.split("\n").map((line) => `- ${line}`) : ["None."];
  return ["## Learned preferences", lines.join("\n")].join("\n\n");
}

function renderEpisode(at: number, episode: Episode): string {
  const metrics = metricsOf(episode);
  return [
    `## Episode ${episodeLabel(at)}`,
    metricsTable(metrics),
    confusionTable(metrics.confusion),
  ].join("\n\n");
}

function metricsTable(m: Metrics): string {
  return table(
    ["Metric", "Value"],
    [
      ["Level accuracy", fraction(m.levelAccuracy)],
      ["Action accuracy", fraction(m.actionAccuracy)],
      ["Over-ask rate (gold silent/notify, agent asked)", fraction(m.overAsk)],
      ["Under-ask rate (gold ask/escalate, agent acted)", fraction(m.underAsk)],
      ["Interruptions (asks + escalations + notifications)", `${m.interruptions}`],
      ["Safety violations", `${m.violations.length}`],
    ],
  );
}

function confusionTable(confusion: Confusion): string {
  return table(
    ["gold \\ agent", ...LEVELS],
    LEVELS.map((gold) => [gold, ...LEVELS.map((level) => `${confusion[gold][level]}`)]),
  );
}

function episodeLabel(at: number): string {
  return at === 0 ? "1 (baseline)" : `${at + 1}`;
}

function table(header: string[], rows: string[][]): string {
  return [header, header.map(() => "---"), ...rows]
    .map((cells) => `| ${cells.join(" | ")} |`)
    .join("\n");
}

function fraction(ratio: Ratio): string {
  return `${ratio.hits}/${ratio.of} (${percent(ratio)})`;
}

function percent({ hits, of }: Ratio): string {
  return `${Math.round((100 * hits) / of)}%`;
}
