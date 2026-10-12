import type { Feedback } from "../src/db/feedback.ts";
import type { Item } from "../src/db/items.ts";
import type { Transcript } from "../src/db/reads.ts";
import type { ActionName, Proposal } from "../src/domain/actions.ts";
import type { Level } from "../src/domain/policy.ts";
import { readScenarios, type Scenario } from "./scenarios.ts";
import type { Outcome } from "./episode.ts";

export type Built = {
  gold: Scenario["gold"];
  level: Level;
  proposal?: Proposal;
  requested?: ActionName;
  category?: Scenario["category"];
  split?: Scenario["split"];
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
  split = base.split,
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
      pin: null,
      level,
      // As in the agent: a suspected email is never analyzed.
      analysis: suspected ? null : { summary: "", intent: "", proposal, requested },
      injection: { suspected, evidence: [] },
      payment: { suspected: false, evidence: [] },
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
          decisionId: 1,
          action: proposal.action,
          senderClass: "known",
          kind: feedback,
          createdAt: "t",
        }
      : null,
  };
  return { scenario: { ...base, gold, category, split }, transcript };
}
