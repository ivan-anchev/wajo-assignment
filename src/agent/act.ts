import { executeProposal, undoProposal, type Proposal } from "../domain/actions.ts";
import { proposalOf } from "../domain/policy.ts";
import { insertExecution, markUndone } from "../db/decision-log.ts";
import { insertItem } from "../db/items.ts";
import type { Db } from "../db/open-db.ts";
import type { Decision, Execution } from "../domain/types.ts";

export function act(db: Db, decision: Decision): void {
  const proposal = proposalOf(decision.analysis);
  const item =
    decision.level === "silent"
      ? null
      : insertItem(db, { decisionId: decision.id, kind: decision.level, proposal });

  if (decision.level === "silent" || decision.level === "notify") {
    execute(db, decision, proposal, item?.id ?? null);
  }
}

export function execute(
  db: Db,
  decision: Decision,
  proposal: Proposal,
  itemId: number | null,
): Execution {
  const now = new Date().toISOString();
  executeProposal(proposal, { db, emailId: decision.emailId, now });

  return insertExecution(db, { decisionId: decision.id, itemId, proposal, executedAt: now });
}

export function undoExecution(db: Db, decision: Decision, execution: Execution): void {
  const now = new Date().toISOString();
  markUndone(db, execution.id, now);
  undoProposal(execution.proposal, { db, emailId: decision.emailId, now });
}
