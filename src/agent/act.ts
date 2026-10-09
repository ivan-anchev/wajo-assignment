import { executeProposal, type Proposal } from "../domain/actions.ts";
import { insertExecution } from "../db/decision-log.ts";
import { insertItem } from "../db/items.ts";
import type { Db } from "../db/open-db.ts";
import type { Decision, Execution, Item, ItemKind, Level } from "../domain/types.ts";

export function act(db: Db, decision: Decision): void {
  const item = decision.level === "silent" ? null : openItem(db, decision, decision.level);
  if (executesWithoutApproval(decision.level)) {
    execute(db, decision, decision.analysis.proposal, item?.id ?? null);
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

function openItem(db: Db, decision: Decision, kind: ItemKind): Item {
  return insertItem(db, { decisionId: decision.id, kind, proposal: decision.analysis.proposal });
}

function executesWithoutApproval(level: Level): boolean {
  return level === "silent" || level === "notify";
}
