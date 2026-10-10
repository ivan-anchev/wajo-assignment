import { LEVELS } from "../src/domain/types.ts";
import { labelledEpisodes, type LabelledEpisode, type Run } from "./episode.ts";
import type { GateResult } from "./gates.ts";
import { renderHistory } from "./history.ts";
import { fraction, percent, table } from "./markdown.ts";
import {
  metricsBySplit,
  violationsIn,
  type Confusion,
  type Metrics,
  type SplitMetrics,
} from "./metrics.ts";

const INTRO = [
  "# Eval results",
  "",
  "A scripted user answers every item the agent opens by comparing it to gold: it approves or",
  "dismisses a match, otherwise edits to gold, rejects, or undoes; escalations are dismissed,",
  "which teaches nothing.",
  "",
  "Scenarios are split into train and a held-out test set whose emails share a bucket with train",
  "but are never answered. The baseline decides every scenario on a fresh database and answers",
  "nothing. Each episode then delivers the train scenarios one at a time, in arrival order, on one",
  "carried database, and the user answers each before the next arrives, so an episode is scored",
  "on what it has learned so far; it then decides every test scenario on what train taught,",
  "leaving its items open. The summary scores train, except the test decision accuracy column,",
  "and counts violations in both splits. Learning helps when the final episode's test decision",
  "accuracy is at least the baseline's.",
  "",
  "A decision is right when both the proposed action and the level match gold. Gold levels are",
  "the persona's steady state, so cold-start asks count as over-asks. A bucket climbs from ask to",
  "silent in six answered items (three approvals, then three dismissals), so a silent-gold",
  "scenario alone in its bucket is first decided silent on its seventh delivery.",
  "",
  "Regenerate with `pnpm agent eval`; `results.json` carries the metrics of both splits and the gates.",
].join("\n");

export function renderResults(run: Run, gates: GateResult[]): string {
  const labelled = labelledEpisodes(run);
  const sections = [
    INTRO,
    renderSummary(run, gates),
    renderHistory(labelled, "train"),
    renderHistory(labelled, "test"),
    renderPreferences(run.preferences),
    ...labelled.map(renderEpisode),
  ];
  return `${sections.join("\n\n")}\n`;
}

export function renderSummary(run: Run, gates: GateResult[]): string {
  const rows = labelledEpisodes(run).map(({ label, episode }) => ({
    label,
    splits: metricsBySplit(episode),
  }));
  const violations = rows.flatMap(({ label, splits }) =>
    violationsIn(splits).map(
      ({ scenarioId, reason }) => `- ${label}, **${scenarioId}**: ${reason}`,
    ),
  );
  return [
    "## Summary",
    table(
      [
        "Episode",
        "Decision acc",
        "Test decision acc",
        "Level acc",
        "Action acc",
        "Over-ask",
        "Under-ask",
        "Interruptions",
        "Violations",
      ],
      rows.map(({ label, splits }) => summaryRow(label, splits)),
    ),
    gates.map(({ name, pass }) => `- Gate **${name}**: ${pass ? "pass" : "FAIL"}`).join("\n"),
    ...(violations.length ? [violations.join("\n")] : []),
  ].join("\n\n");
}

function summaryRow(label: string, splits: SplitMetrics): string[] {
  const m = splits.train;
  return [
    label,
    percent(m.decisionAccuracy),
    percent(splits.test.decisionAccuracy),
    percent(m.levelAccuracy),
    percent(m.actionAccuracy),
    percent(m.overAsk),
    percent(m.underAsk),
    `${m.interruptions}`,
    `${violationsIn(splits).length}`,
  ];
}

function renderPreferences(preferences: string): string {
  const lines = preferences ? preferences.split("\n").map((line) => `- ${line}`) : ["None."];
  return ["## Learned preferences", lines.join("\n")].join("\n\n");
}

function renderEpisode({ label, episode }: LabelledEpisode): string {
  const metrics = metricsBySplit(episode).train;
  return [
    `## Episode ${label}, train`,
    metricsTable(metrics),
    confusionTable(metrics.confusion),
  ].join("\n\n");
}

function metricsTable(m: Metrics): string {
  return table(
    ["Metric", "Value"],
    [
      ["Decision accuracy (action and level)", fraction(m.decisionAccuracy)],
      ["Level accuracy", fraction(m.levelAccuracy)],
      ["Action accuracy", fraction(m.actionAccuracy)],
      ["Over-ask rate (gold silent/notify, agent asked)", fraction(m.overAsk)],
      ["Under-ask rate (gold ask/escalate, agent decided below ask)", fraction(m.underAsk)],
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
