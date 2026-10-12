import type { Proposal } from "../src/domain/actions.ts";
import { levelFor, type Analysis, type ItemResponse, type Level } from "../src/domain/policy.ts";
import { byArrival } from "../src/inbox/inbox.ts";
import { outcomesIn, type Episode, type Outcome, type Run } from "./episode.ts";
import type { Ratio } from "./metrics.ts";
import { replyTo } from "./oracle.ts";
import { correctedParams, type Scenario } from "./scenarios.ts";

export type Ceiling = Record<Scenario["split"], Ratio>;

// Learned histories per bucket: gold action and sender class.
type Histories = Map<string, ItemResponse[]>;

// The level accuracy the agent would reach if the LLM always proposed the gold action with the
// corrected params and the email requested nothing. A reference, not a bound: a wrong action can
// still land on the gold level.
// One entry per labelled episode, the baseline first.
export function ceilingOf({ baseline, episodes }: Run): Ceiling[] {
  const train = outcomesIn(baseline, "train").toSorted((a, b) => byArrival(a.scenario, b.scenario));
  const test = outcomesIn(baseline, "test");
  const fresh: Histories = new Map();
  const histories: Histories = new Map();
  return [
    {
      train: levelAccuracy(train, (outcome) => decide(fresh, outcome)),
      test: levelAccuracy(test, (outcome) => decide(fresh, outcome)),
    },
    ...episodes.map(() => ({
      train: levelAccuracy(train, (outcome) => deliverAndAnswer(histories, outcome)),
      test: levelAccuracy(test, (outcome) => decide(histories, outcome)),
    })),
  ];
}

// Escalations are dismissed, which teaches nothing, and a silent decision opens no item.
function deliverAndAnswer(histories: Histories, outcome: Outcome): Level {
  const level = decide(histories, outcome);
  if (level === "notify" || level === "ask") {
    const { response } = replyTo(
      { kind: level, proposal: goldProposal(outcome.scenario) },
      outcome.scenario,
    );
    histories.set(bucketOf(outcome), [...historyOf(histories, outcome), response]);
  }
  return level;
}

function decide(histories: Histories, outcome: Outcome): Level {
  const { scenario } = outcome;
  const analysis: Analysis = {
    summary: "",
    intent: "",
    proposal: goldProposal(scenario),
    requested: "none",
  };
  const injection = { suspected: scenario.category === "injection", evidence: [] };
  const { payment } = outcome.transcript.decision;
  return levelFor(analysis, [injection, payment], historyOf(histories, outcome), null).level;
}

function goldProposal(scenario: Scenario): Proposal {
  return { action: scenario.gold.action, params: correctedParams(scenario) };
}

function historyOf(histories: Histories, outcome: Outcome): ItemResponse[] {
  return histories.get(bucketOf(outcome)) ?? [];
}

function bucketOf({ scenario, transcript }: Outcome): string {
  return `${scenario.gold.action}/${transcript.email.senderClass}`;
}

// Decides in order, so a train outcome is answered before the next one is decided.
function levelAccuracy(outcomes: Episode, levelOf: (outcome: Outcome) => Level): Ratio {
  const levels = outcomes.map(levelOf);
  const hits = outcomes.filter(({ scenario }, at) => levels[at] === scenario.gold.level).length;
  return { hits, of: outcomes.length };
}
