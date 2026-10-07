import type { ActionName } from "../domain/actions.ts";
import type { Decision, Execution, Item, Transcript } from "../domain/types.ts";
import { getEmail } from "./mailbox.ts";
import type { Db } from "./open-db.ts";

type DecisionRow = Omit<Decision, "analysis" | "injection"> & {
  analysis: string;
  injection: string;
};
type ItemRow = Omit<Item, "proposal"> & { proposal: string };
type ExecutionRow = Omit<Execution, "proposal"> & { action: ActionName; params: string };

const DECISION_COLUMNS =
  "id, email_id AS emailId, analysis, injection, floor, level, created_at AS createdAt";
const ITEM_COLUMNS =
  "id, decision_id AS decisionId, kind, status, proposal, created_at AS createdAt, resolved_at AS resolvedAt";
const EXECUTION_COLUMNS =
  "id, decision_id AS decisionId, item_id AS itemId, action, params, executed_at AS executedAt, undone_at AS undoneAt";

export function insertDecision(db: Db, decision: Omit<Decision, "id" | "createdAt">): Decision {
  const row = db
    .prepare<[object], DecisionRow>(
      `INSERT INTO decisions (email_id, analysis, injection, floor, level)
       VALUES (@emailId, @analysis, @injection, @floor, @level) RETURNING ${DECISION_COLUMNS}`,
    )
    .get({
      ...decision,
      analysis: JSON.stringify(decision.analysis),
      injection: JSON.stringify(decision.injection),
    })!;
  return toDecision(row);
}

export function insertItem(db: Db, item: Pick<Item, "decisionId" | "kind" | "proposal">): Item {
  const row = db
    .prepare<[object], ItemRow>(
      `INSERT INTO items (decision_id, kind, proposal) VALUES (@decisionId, @kind, @proposal) RETURNING ${ITEM_COLUMNS}`,
    )
    .get({ ...item, proposal: JSON.stringify(item.proposal) })!;
  return toItem(row);
}

// executedAt comes from the caller: the same `now` the action wrote with.
export function insertExecution(
  db: Db,
  execution: Pick<Execution, "decisionId" | "itemId" | "proposal" | "executedAt">,
): Execution {
  const row = db
    .prepare<[object], ExecutionRow>(
      `INSERT INTO executions (decision_id, item_id, action, params, executed_at)
       VALUES (@decisionId, @itemId, @action, @params, @executedAt) RETURNING ${EXECUTION_COLUMNS}`,
    )
    .get({
      decisionId: execution.decisionId,
      itemId: execution.itemId,
      action: execution.proposal.action,
      params: JSON.stringify(execution.proposal.params),
      executedAt: execution.executedAt,
    })!;
  return toExecution(row);
}

// Starts from the decision: an email row exists only alongside its decision.
export function findTranscript(db: Db, emailId: string): Transcript | null {
  const decision = findDecisionByEmail(db, emailId);
  if (!decision) {
    return null;
  }
  return {
    email: getEmail(db, emailId),
    decision,
    item: findItemByDecision(db, decision.id),
    executions: listExecutionsByDecision(db, decision.id),
  };
}

function findDecisionByEmail(db: Db, emailId: string): Decision | null {
  const row = db
    .prepare<[string], DecisionRow>(`SELECT ${DECISION_COLUMNS} FROM decisions WHERE email_id = ?`)
    .get(emailId);
  return row ? toDecision(row) : null;
}

function findItemByDecision(db: Db, decisionId: number): Item | null {
  const row = db
    .prepare<[number], ItemRow>(`SELECT ${ITEM_COLUMNS} FROM items WHERE decision_id = ?`)
    .get(decisionId);
  return row ? toItem(row) : null;
}

function listExecutionsByDecision(db: Db, decisionId: number): Execution[] {
  return db
    .prepare<[number], ExecutionRow>(
      `SELECT ${EXECUTION_COLUMNS} FROM executions WHERE decision_id = ? ORDER BY id`,
    )
    .all(decisionId)
    .map(toExecution);
}

function toDecision(row: DecisionRow): Decision {
  return { ...row, analysis: JSON.parse(row.analysis), injection: JSON.parse(row.injection) };
}

function toItem(row: ItemRow): Item {
  return { ...row, proposal: JSON.parse(row.proposal) };
}

function toExecution({ action, params, ...row }: ExecutionRow): Execution {
  return { ...row, proposal: { action, params: JSON.parse(params) } };
}
