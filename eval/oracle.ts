import type { Agent } from "../src/agent/agent.ts";
import { actionFor, type ActionName, type Proposal } from "../src/domain/actions.ts";
import type { Item, ItemResponse, ProposalEdit, ResponseResult } from "../src/domain/types.ts";
import { correctedParams, type Scenario } from "../src/scenarios/scenarios.ts";

type Reply =
  | { response: Exclude<ItemResponse, "edit" | "reject"> }
  | { response: "edit"; edit: ProposalEdit }
  | { response: "reject"; reason?: string };

export async function answer(
  agent: Agent,
  scenario: Scenario,
  item: Item,
): Promise<ResponseResult> {
  return send(agent, item.id, replyTo(item, scenario));
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
  if (proposal.action === gold.action && carries(proposal, correctedParams(scenario))) {
    return { response: "approve" };
  }
  if (correction && "reason" in correction) {
    return { response: "reject", reason: correction.reason };
  }
  if (correction || editableWithoutCorrection(gold.action)) {
    return { response: "edit", edit: { action: gold.action, ...correctedParams(scenario) } };
  }
  return { response: "reject" };
}

function carries(proposal: Proposal, params: Proposal["params"]): boolean {
  return Object.entries(params).every(([key, value]) => proposal.params[key] === value);
}

// Editing to an inert action teaches the same negative as a reject, plus a needless extraction.
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
