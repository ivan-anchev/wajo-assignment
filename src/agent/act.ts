import { executeProposal, undoProposal, type Proposal } from "../domain/actions.ts";
import { proposalOf } from "../domain/policy.ts";
import { insertExecution, markUndone } from "../db/decision-log.ts";
import { insertItem } from "../db/items.ts";
import type { Db } from "../db/open-db.ts";
import type { Decision, Execution, Item, ItemKind, Level } from "../domain/types.ts";
import { Refusal } from "./refusal.ts";

export function act(db: Db, decision: Decision): void {
  const proposal = proposalOf(decision.analysis);
  const item =
    decision.level === "silent" ? null : openItem(db, decision, decision.level, proposal);
  if (executesWithoutApproval(decision.level)) {
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
  if (!markUndone(db, execution.id, now)) {
    throw new Refusal(`Decision #${decision.id} is already undone.`);
  }
  undoProposal(execution.proposal, { db, emailId: decision.emailId, now });
}

function openItem(db: Db, decision: Decision, kind: ItemKind, proposal: Proposal): Item {
  return insertItem(db, { decisionId: decision.id, kind, proposal });
}

function executesWithoutApproval(level: Level): boolean {
  return level === "silent" || level === "notify";
}
