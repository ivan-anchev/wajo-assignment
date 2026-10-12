import type { ResponseResult, Responses } from "../src/app/responses.ts";
import type { Decision } from "../src/db/decisions.ts";
import type { Item } from "../src/db/items.ts";
import type { Transcript } from "../src/db/reads.ts";
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

export async function answer(
  responses: Responses,
  scenario: Scenario,
  { decision, item }: Transcript,
): Promise<ResponseResult | null> {
  if (needsCorrection(decision, item, scenario)) {
    return responses.correct(decision.id, goldEdit(scenario));
  }
  return item ? send(responses, item.id, replyTo(item, scenario)) : null;
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

// A wrong action that ran without asking is corrected on its decision, when the oracle can name the
// gold proposal; a wrong notified action it cannot name is undone on its item.
function needsCorrection(decision: Decision, item: Item | null, scenario: Scenario): boolean {
  return (
    (item === null || item.kind === "notify") &&
    proposalOf(decision.analysis).action !== scenario.gold.action &&
    canNameGold(scenario)
  );
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

function canNameGold({ gold, correction }: Scenario): boolean {
  return correction !== undefined || takesNoParams(gold.action);
}

// A proposal whose gold is inert is rejected: editing to an inert action would execute nothing
// and cost a needless extraction.
function editableWithoutCorrection(action: ActionName): boolean {
  return !actionFor(action).inert && takesNoParams(action);
}

function takesNoParams(action: ActionName): boolean {
  return Object.keys(actionFor(action).params.shape).length === 0;
}

async function send(responses: Responses, itemId: number, reply: Reply): Promise<ResponseResult> {
  switch (reply.response) {
    case "approve":
      return responses.approve(itemId);
    case "edit":
      return responses.edit(itemId, reply.edit);
    case "reject":
      return responses.reject(itemId, reply.reason);
    case "dismiss":
      return responses.dismiss(itemId);
    case "undo":
      return responses.undo(itemId);
  }
}
