import { executeProposal, undoProposal, type Proposal } from "../domain/actions.ts";
import { proposalOf } from "../domain/policy.ts";
import type { Decision } from "../db/decisions.ts";
import type { Execution } from "../db/executions.ts";
import type { Store } from "../db/store.ts";

export function act(store: Store, decision: Decision): void {
  const proposal = proposalOf(decision.analysis);
  const item =
    decision.level === "silent"
      ? null
      : store.items.insert({ decisionId: decision.id, kind: decision.level, proposal });

  if (decision.level === "silent" || decision.level === "notify") {
    execute(store, decision, proposal, item?.id ?? null);
  }
}

export function execute(
  store: Store,
  decision: Decision,
  proposal: Proposal,
  itemId: number | null,
): Execution {
  const now = new Date().toISOString();

  executeProposal(proposal, { emails: store.emails, emailId: decision.emailId, now });

  return store.executions.insert({ decisionId: decision.id, itemId, proposal, executedAt: now });
}

export function undoExecution(store: Store, decision: Decision, execution: Execution): void {
  const now = new Date().toISOString();

  store.executions.update(execution.id, { undoneAt: now });

  undoProposal(execution.proposal, { emails: store.emails, emailId: decision.emailId, now });
}
