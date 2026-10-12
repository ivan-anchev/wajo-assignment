import type { Agent, ResponseResult } from "../src/agent/agent.ts";
import type { Item } from "../src/db/items.ts";
import type { Transcript } from "../src/db/store.ts";
import {
  actionFor,
  type ActionName,
  type Proposal,
  type ProposalEdit,
} from "../src/domain/actions.ts";
import { proposalOf, type ItemResponse } from "../src/domain/policy.ts";
import { correctedParams, type Scenario } from "./scenarios.ts";

type Reply =
  | { response: Exclude<ItemResponse, "edit" | "reject"> }
  | { response: "edit"; edit: ProposalEdit }
  | { response: "reject"; reason?: string };

// Answers the item a delivery opened; a silent decision has none, so a wrong action is corrected.
export async function answer(
  agent: Agent,
  scenario: Scenario,
  { decision, item }: Transcript,
): Promise<ResponseResult | null> {
  if (item) {
    return send(agent, item.id, replyTo(item, scenario));
  }
  return proposalOf(decision.analysis).action === scenario.gold.action
    ? null
    : agent.correct(decision.id, goldEdit(scenario));
}

export function replyTo(
  { kind, proposal }: Pick<Item, "kind" | "proposal">,
  scenario: Scenario,
): Reply {
  switch (kind) {
    case "ask":
      return replyToAsk(proposal, scenario);
    case "notify":
      return { response: proposal.action === scenario.gold.action ? "dismiss" : "undo" };
    case "escalate":
      return { response: "dismiss" };
  }
}

function replyToAsk(proposal: Proposal, scenario: Scenario): Reply {
  const { gold, correction } = scenario;
  if (proposal.action === gold.action) {
    return { response: "approve" };
  }
  if (correction && "reason" in correction) {
    return { response: "reject", reason: correction.reason };
  }
  if (correction || editableWithoutCorrection(gold.action)) {
    return { response: "edit", edit: goldEdit(scenario) };
  }
  return { response: "reject" };
}

function goldEdit(scenario: Scenario): ProposalEdit {
  return { action: scenario.gold.action, ...correctedParams(scenario) };
}

// A proposal whose gold is inert is rejected: editing to an inert action would execute nothing
// and cost a needless extraction.
function editableWithoutCorrection(action: ActionName): boolean {
  const { inert, params } = actionFor(action);
  return !inert && Object.keys(params.shape).length === 0;
}

async function send(agent: Agent, itemId: number, reply: Reply): Promise<ResponseResult> {
  switch (reply.response) {
    case "approve":
      return agent.approve(itemId);
    case "edit":
      return agent.edit(itemId, reply.edit);
    case "reject":
      return agent.reject(itemId, reply.reason);
    case "dismiss":
      return agent.dismiss(itemId);
    case "undo":
      return agent.undo(itemId);
  }
}
