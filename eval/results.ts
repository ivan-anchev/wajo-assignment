import { LEVELS } from "../src/domain/types.ts";
import { labelledEpisodes, type LabelledEpisode, type Outcome, type Run } from "./episode.ts";
import type { GateResult } from "./gates.ts";
import {
  metricsOf,
  scoreOutcome,
  share,
  type Confusion,
  type Metrics,
  type Ratio,
} from "./metrics.ts";

const INTRO = [
  "# Eval results",
  "",
  "A scripted user answers every item the agent opens by comparing it to gold: it approves or",
  "dismisses a match, otherwise edits to gold, rejects, or undoes; escalations are dismissed,",
  "which teaches nothing.",
  "",
  "The baseline decides every scenario on a fresh database and answers nothing. Each episode then",
  "delivers the scenarios one at a time, in arrival order, on one carried database, and the user",
  "answers each before the next arrives, so an episode is scored on what it has learned so far.",
  "A decision is right when both the proposed action and the level match gold. Gold levels are",
  "the persona's steady state, so cold-start asks count as over-asks. A bucket climbs from ask to",
  "silent in six answered items (three approvals, then three dismissals), so a silent-gold",
  "scenario alone in its bucket is first decided silent on its seventh delivery.",
  "",
  "Regenerate with `pnpm agent eval`; `results.json` carries the same metrics and gates.",
].join("\n");

export function renderResults(run: Run, gates: GateResult[]): string {
  const labelled = labelledEpisodes(run);
  const sections = [
    INTRO,
    renderSummary(run, gates),
    renderHistory(labelled),
    renderPreferences(run.preferences),
    ...labelled.map(renderEpisode),
  ];
  return `${sections.join("\n\n")}\n`;
}

export function renderSummary(run: Run, gates: GateResult[]): string {
  const rows = labelledEpisodes(run).map(({ label, episode }) => ({
    label,
    m: metricsOf(episode),
  }));
  const violations = rows.flatMap(({ label, m }) =>
    m.violations.map(({ scenarioId, reason }) => `- ${label}, **${scenarioId}**: ${reason}`),
  );
  return [
    "## Summary",
    table(
      [
        "Episode",
        "Decision acc",
        "Level acc",
        "Action acc",
        "Over-ask",
        "Under-ask",
        "Interruptions",
        "Violations",
      ],
      rows.map(({ label, m }) => summaryRow(label, m)),
    ),
    gates.map(({ name, pass }) => `- Gate **${name}**: ${pass ? "pass" : "FAIL"}`).join("\n"),
    ...(violations.length ? [violations.join("\n")] : []),
  ].join("\n\n");
}

function summaryRow(label: string, m: Metrics): string[] {
  return [
    label,
    percent(m.decisionAccuracy),
    percent(m.levelAccuracy),
    percent(m.actionAccuracy),
    percent(m.overAsk),
    percent(m.underAsk),
    `${m.interruptions}`,
    `${m.violations.length}`,
  ];
}

function renderHistory(labelled: LabelledEpisode[]): string {
  const rows = labelled[0]!.episode.map(({ scenario }, at) => [
    scenario.id,
    `${scenario.gold.action} / ${scenario.gold.level}`,
    ...labelled.map(({ episode }) => historyCell(episode[at]!)),
  ]);
  return [
    "## Per-scenario history",
    "Level reached per episode, ✓ when both action and level match gold; the proposed action is shown when it differs from gold.",
    table(["Scenario", "Gold", ...labelled.map(({ label }) => label)], rows),
  ].join("\n\n");
}

function historyCell(outcome: Outcome): string {
  const { level, analysis } = outcome.transcript.decision;
  const { action } = analysis.proposal;
  const mark = scoreOutcome(outcome).decision ? "✓" : "✗";
  return `${level} ${mark}${action === outcome.scenario.gold.action ? "" : ` (${action})`}`;
}

function renderPreferences(preferences: string): string {
  const lines = preferences ? preferences.split("\n").map((line) => `- ${line}`) : ["None."];
  return ["## Learned preferences", lines.join("\n")].join("\n\n");
}

function renderEpisode({ label, episode }: LabelledEpisode): string {
  const metrics = metricsOf(episode);
  return [`## Episode ${label}`, metricsTable(metrics), confusionTable(metrics.confusion)].join(
    "\n\n",
  );
}

function metricsTable(m: Metrics): string {
  return table(
    ["Metric", "Value"],
    [
      ["Decision accuracy (action and level)", fraction(m.decisionAccuracy)],
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

function table(header: string[], rows: string[][]): string {
  return [header, header.map(() => "---"), ...rows]
    .map((cells) => `| ${cells.join(" | ")} |`)
    .join("\n");
}

function fraction(ratio: Ratio): string {
  return `${ratio.hits}/${ratio.of} (${percent(ratio)})`;
}

function percent(ratio: Ratio): string {
  return `${Math.round(100 * share(ratio))}%`;
}
