import { executeProposal } from "../actions/index.ts";
import type { ItemKind, Level } from "../policy/index.ts";
import { insertExecution, insertItem, type Db } from "../store/index.ts";
import type { Decision, Execution, Item } from "./records.model.ts";

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
