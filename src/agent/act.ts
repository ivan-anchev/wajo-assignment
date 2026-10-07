import { executeProposal } from "../domain/actions.ts";
import { insertExecution, insertItem } from "../db/decision-log.ts";
import type { Db } from "../db/open-db.ts";
import type { Decision, Execution, Item, ItemKind, Level } from "../domain/types.ts";

export function act(db: Db, decision: Decision): { item: Item | null; executions: Execution[] } {
  const item = decision.level === "silent" ? null : openItem(db, decision, decision.level);
  const executions = executesWithoutApproval(decision.level) ? [execute(db, decision, item)] : [];
  return { item, executions };
}

function openItem(db: Db, decision: Decision, kind: ItemKind): Item {
  return insertItem(db, { decisionId: decision.id, kind, proposal: decision.analysis.proposal });
}

function execute(db: Db, decision: Decision, item: Item | null): Execution {
  const { proposal } = decision.analysis;
  const now = new Date().toISOString();
  executeProposal(proposal, { db, emailId: decision.emailId, now });
  return insertExecution(db, {
    decisionId: decision.id,
    itemId: item?.id ?? null,
    proposal,
    executedAt: now,
  });
}

function executesWithoutApproval(level: Level): boolean {
  return level === "silent" || level === "notify";
}
