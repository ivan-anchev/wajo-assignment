import type { ActionName, Proposal } from "../src/domain/actions.ts";
import type { Feedback, Item, Level, Transcript } from "../src/domain/types.ts";
import { readScenarios, type Scenario } from "../src/scenarios/scenarios.ts";
import type { Outcome } from "./episode.ts";

export type Built = {
  gold: Scenario["gold"];
  level: Level;
  proposal?: Proposal;
  requested?: ActionName;
  category?: Scenario["category"];
  executed?: readonly Proposal[];
  approved?: boolean;
  feedback?: Feedback["kind"];
  suspected?: boolean;
};

const base = readScenarios()[0]!;

export function outcome({
  gold,
  level,
  proposal = { action: gold.action, params: {} },
  requested = "none",
  category = base.category,
  executed = [],
  approved = false,
  feedback,
  suspected = false,
}: Built): Outcome {
  const item: Item | null =
    level === "silent"
      ? null
      : {
          id: 1,
          decisionId: 1,
          kind: level,
          status: approved ? "approved" : "open",
          proposal,
          createdAt: "t",
          resolvedAt: null,
          allowedResponses: [],
        };
  const transcript: Transcript = {
    email: { ...base, senderClass: "known" },
    decision: {
      id: 1,
      emailId: base.id,
      floor: "silent",
      learned: "ask",
      brake: false,
      pin: null,
      level,
      analysis: { summary: "", intent: "", proposal, requested, confidence: 0.9 },
      injection: { suspected, evidence: [] },
      createdAt: "t",
    },
    item,
    executions: executed.map((executedProposal, at) => ({
      id: at + 1,
      decisionId: 1,
      itemId: item?.id ?? null,
      proposal: executedProposal,
      executedAt: "t",
      undoneAt: null,
    })),
    feedback: feedback
      ? {
          id: 1,
          itemId: 1,
          action: proposal.action,
          senderClass: "known",
          kind: feedback,
          createdAt: "t",
        }
      : null,
  };
  return { scenario: { ...base, gold, category }, transcript };
}
