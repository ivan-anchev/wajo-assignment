import type { Decision } from "../db/decisions.ts";
import type { Execution } from "../db/executions.ts";
import type { Store } from "../db/store.ts";
import { executeProposal, undoProposal, type Proposal } from "../domain/actions.ts";
import { floor, requestOf } from "../domain/policy.ts";
import { Refusal } from "./refusal.ts";

export function execute(
  store: Store,
  decision: Decision,
  proposal: Proposal,
  itemId: number | null,
): Execution {
  refuseIfFloorEscalates(decision, proposal);

  const now = new Date().toISOString();

  executeProposal(proposal, { emails: store.emails, emailId: decision.emailId, now });

  return store.executions.insert({ decisionId: decision.id, itemId, proposal, executedAt: now });
}

export function undoExecution(store: Store, decision: Decision, execution: Execution): void {
  const now = new Date().toISOString();

  store.executions.update(execution.id, { undoneAt: now });

  undoProposal(execution.proposal, { emails: store.emails, emailId: decision.emailId, now });
}

export function refuseIfFloorEscalates(
  { analysis, injection, payment }: Decision,
  proposal: Proposal,
): void {
  if (floor([proposal.action, requestOf(analysis)], [injection, payment]) === "escalate") {
    throw new Refusal(`${proposal.action} must be escalated; nothing was executed.`);
  }
}
