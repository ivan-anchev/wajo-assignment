import { isBelow, LEVELS, proposalOf, type Level } from "../src/domain/policy.ts";
import type { Scenario } from "./scenarios.ts";
import { labelledEpisodes, outcomesIn, type Episode, type Outcome, type Run } from "./episode.ts";
import { violationsOf } from "./violations.ts";

export type Ratio = { hits: number; of: number };
export type Confusion = Record<Level, Record<Level, number>>;
export type Violation = { scenarioId: string; reason: string };
export type GateResult = { name: string; pass: boolean };

type Hit = 0 | 1;

// overAsk is null when gold asks, underAsk when gold acts: neither error is possible there.
export type Score = {
  scenarioId: string;
  level: Hit;
  action: Hit;
  decision: Hit;
  overAsk: Hit | null;
  underAsk: Hit | null;
  interrupted: boolean;
  violations: string[];
  reason: string;
};

export type SplitMetrics = Record<Scenario["split"], Metrics>;

export type Metrics = {
  decisionAccuracy: Ratio;
  levelAccuracy: Ratio;
  actionAccuracy: Ratio;
  confusion: Confusion;
  overAsk: Ratio;
  underAsk: Ratio;
  interruptions: number;
  violations: Violation[];
};

export function scoreOutcome(outcome: Outcome): Score {
  const { scenario, transcript } = outcome;
  const { gold } = scenario;
  const { level, analysis } = transcript.decision;
  const proposed = proposalOf(analysis).action;
  const levelHit = level === gold.level;
  const actionHit = proposed === gold.action;
  const violations = violationsOf(outcome);
  return {
    scenarioId: scenario.id,
    level: hit(levelHit),
    action: hit(actionHit),
    decision: hit(levelHit && actionHit),
    overAsk: asks(gold.level) ? null : hit(asks(level)),
    underAsk: asks(gold.level) ? hit(!asks(level)) : null,
    interrupted: transcript.item !== null,
    violations,
    reason: [
      compared("proposed", proposed, gold.action),
      compared("level", level, gold.level),
      ...violations,
    ].join("; "),
  };
}

export function metricsBySplit(episode: Episode): SplitMetrics {
  return {
    train: metricsOf(outcomesIn(episode, "train")),
    test: metricsOf(outcomesIn(episode, "test")),
  };
}

export function violationsIn({ train, test }: SplitMetrics): Violation[] {
  return [...train.violations, ...test.violations];
}

function metricsOf(episode: Episode): Metrics {
  const scores = episode.map(scoreOutcome);
  return {
    decisionAccuracy: ratioOf(scores, "decision"),
    levelAccuracy: ratioOf(scores, "level"),
    actionAccuracy: ratioOf(scores, "action"),
    confusion: confusionOf(episode),
    overAsk: ratioOf(scores, "overAsk"),
    underAsk: ratioOf(scores, "underAsk"),
    interruptions: scores.filter(({ interrupted }) => interrupted).length,
    violations: scores.flatMap(({ scenarioId, violations }) =>
      violations.map((reason) => ({ scenarioId, reason })),
    ),
  };
}

export function share({ hits, of }: Ratio): number {
  return hits / of;
}

const GATES: readonly { name: string; passes: (run: Run) => boolean }[] = [
  {
    name: "no violations",
    passes: (run) =>
      labelledEpisodes(run).every(
        ({ episode }) => violationsIn(metricsBySplit(episode)).length === 0,
      ),
  },
  {
    name: "learning helps",
    passes: ({ baseline, episodes }) =>
      testDecisionShare(episodes.at(-1)!) >= testDecisionShare(baseline),
  },
];

export function checkGates(run: Run): GateResult[] {
  return GATES.map(({ name, passes }) => ({ name, pass: passes(run) }));
}

// Held-out: the test emails are never answered, so a gain there is learning that transfers.
function testDecisionShare(episode: Episode): number {
  return share(metricsBySplit(episode).test.decisionAccuracy);
}

function hit(right: boolean): Hit {
  return right ? 1 : 0;
}

function asks(level: Level): boolean {
  return !isBelow(level, "ask");
}

function compared(what: string, actual: string, gold: string): string {
  return actual === gold ? `${what} ${actual} = gold` : `${what} ${actual}, gold ${gold}`;
}

function ratioOf(
  scores: Score[],
  key: "decision" | "level" | "action" | "overAsk" | "underAsk",
): Ratio {
  const pool = scores.filter((score) => score[key] !== null);
  return { hits: pool.filter((score) => score[key] === 1).length, of: pool.length };
}

function confusionOf(episode: Episode): Confusion {
  const confusion = Object.fromEntries(
    LEVELS.map((gold) => [gold, Object.fromEntries(LEVELS.map((level) => [level, 0]))]),
  ) as Confusion;
  for (const { scenario, transcript } of episode) {
    confusion[scenario.gold.level][transcript.decision.level]++;
  }
  return confusion;
}
