import { LEVELS } from "../src/domain/policy.ts";
import { renderCategories } from "./categories.ts";
import { labelledEpisodes, type LabelledEpisode, type Run } from "./episode.ts";
import { renderHistory } from "./history.ts";
import { percent, table } from "./markdown.ts";
import {
  metricsBySplit,
  violationsIn,
  type Confusion,
  type GateResult,
  type Metrics,
  type SplitMetrics,
} from "./metrics.ts";

const INTRO = [
  "# Eval results",
  "",
  "A scripted user answers every item the agent opens by comparing it to gold: it approves or",
  "dismisses a proposal whose action matches gold, whatever its params, otherwise edits to the",
  "gold action, rejects, or undoes; escalations are dismissed, which teaches nothing. An edit to",
  "another action teaches nothing about the level either: the proposal was wrong, not the level.",
  "",
  "Scenarios are split into train and a held-out test set whose emails share a bucket with train",
  "but are never answered. The baseline decides every scenario on a fresh database and answers",
  "nothing. Each episode then delivers the train scenarios one at a time, in arrival order, on one",
  "carried database, and the user answers each before the next arrives, so an episode is scored",
  "on what it has learned so far; it then decides every test scenario on what train taught,",
  "leaving its items open. The summary scores train, except the columns marked test, and counts",
  "violations in both splits. Level accuracy, over-ask and under-ask are scored only where the",
  "proposed action matches gold: the level of a wrong proposal says nothing about the learner,",
  "since another action has another floor and another bucket. Decision accuracy and action",
  "accuracy score every scenario. On the held-out test split, the final episode must over-ask at",
  "most half as often as the baseline and must not under-ask more often. Each run is one recorded",
  "sample: a difference of one or two scenarios between runs is noise, so compare numbers within",
  "a run.",
  "",
  "A decision is right when both the proposed action and the level match gold. Gold levels are",
  "the persona's steady state, so cold-start asks count as over-asks. A bucket climbs from ask to",
  "silent in four answered items (two approvals, then two dismissals), so a silent-gold",
  "scenario alone in its bucket is first decided silent on its fifth delivery.",
  "",
  "The analysis prompt carries a short user profile, so baseline action accuracy already includes",
  "what the profile teaches; the learned preferences build on it.",
  "",
  "Regenerate with `pnpm agent eval`; `results.json` carries the metrics of both splits and the gates.",
].join("\n");

export function renderResults(run: Run, gates: GateResult[]): string {
  const labelled = labelledEpisodes(run);
  const sections = [
    INTRO,
    renderSummary(run, gates),
    renderCategories(labelled.at(-1)!),
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
        "Test over-ask",
        "Test under-ask",
        "Interruptions",
        "Violations",
      ],
      rows.map(({ label, splits }) => summaryRow(label, splits)),
    ),
    gates.map(({ name, pass }) => `- Gate **${name}**: ${pass ? "pass" : "FAIL"}`).join("\n"),
    ...(violations.length ? [violations.join("\n")] : []),
  ].join("\n\n");
}

export function renderResultsJson(model: string, run: Run, gates: GateResult[]): string {
  const results = {
    model,
    episodes: labelledEpisodes(run).map(({ label, episode }) => ({
      label,
      metrics: metricsBySplit(episode),
    })),
    gates,
  };
  return `${JSON.stringify(results, null, 2)}\n`;
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
    percent(splits.test.overAsk),
    percent(splits.test.underAsk),
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
      ["Decision accuracy (action and level)", percent(m.decisionAccuracy)],
      ["Level accuracy", percent(m.levelAccuracy)],
      ["Action accuracy", percent(m.actionAccuracy)],
      ["Over-ask rate (gold silent/notify, agent asked)", percent(m.overAsk)],
      ["Under-ask rate (gold ask/escalate, agent decided below ask)", percent(m.underAsk)],
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
