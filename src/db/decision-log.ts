import type { ActionName } from "../domain/actions.ts";
import type { Decision, Execution, Transcript } from "../domain/types.ts";
import { findFeedbackByItem } from "./feedback.ts";
import { findItemByDecision } from "./items.ts";
import { getEmail } from "./mailbox.ts";
import type { Db } from "./open-db.ts";

type DecisionRow = Omit<Decision, "analysis" | "injection" | "brake"> & {
  analysis: string;
  injection: string;
  brake: 0 | 1;
};
type ExecutionRow = Omit<Execution, "proposal"> & { action: ActionName; params: string };

const DECISION_COLUMNS =
  "id, email_id AS emailId, analysis, injection, floor, learned, brake, level, created_at AS createdAt";
const EXECUTION_COLUMNS =
  "id, decision_id AS decisionId, item_id AS itemId, action, params, executed_at AS executedAt, undone_at AS undoneAt";

export function insertDecision(db: Db, decision: Omit<Decision, "id" | "createdAt">): Decision {
  const row = db
    .prepare<[object], DecisionRow>(
      `INSERT INTO decisions (email_id, analysis, injection, floor, learned, brake, level)
       VALUES (@emailId, @analysis, @injection, @floor, @learned, @brake, @level) RETURNING ${DECISION_COLUMNS}`,
    )
    .get({
      ...decision,
      analysis: JSON.stringify(decision.analysis),
      injection: JSON.stringify(decision.injection),
      brake: decision.brake ? 1 : 0,
    })!;
  return toDecision(row);
}

export function getDecision(db: Db, id: number): Decision {
  const row = db
    .prepare<[number], DecisionRow>(`SELECT ${DECISION_COLUMNS} FROM decisions WHERE id = ?`)
    .get(id)!;
  return toDecision(row);
}

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

export function findExecutionByItem(db: Db, itemId: number): Execution {
  const row = db
    .prepare<[number], ExecutionRow>(
      `SELECT ${EXECUTION_COLUMNS} FROM executions WHERE item_id = ?`,
    )
    .get(itemId)!;
  return toExecution(row);
}

export function markUndone(db: Db, executionId: number, undoneAt: string): void {
  db.prepare("UPDATE executions SET undone_at = ? WHERE id = ?").run(undoneAt, executionId);
}

export function findTranscript(db: Db, emailId: string): Transcript | null {
  const decision = findDecisionByEmail(db, emailId);
  return decision ? transcriptOf(db, decision) : null;
}

export function openTranscripts(db: Db): Transcript[] {
  return db
    .prepare<[], DecisionRow>(
      `SELECT ${DECISION_COLUMNS} FROM decisions
       WHERE id IN (SELECT decision_id FROM items WHERE status = 'open')
       ORDER BY id`,
    )
    .all()
    .map((row) => transcriptOf(db, toDecision(row)));
}

export function transcriptOf(db: Db, decision: Decision): Transcript {
  const item = findItemByDecision(db, decision.id);
  return {
    email: getEmail(db, decision.emailId),
    decision,
    item,
    executions: listExecutionsByDecision(db, decision.id),
    feedback: item ? findFeedbackByItem(db, item.id) : null,
  };
}

function findDecisionByEmail(db: Db, emailId: string): Decision | null {
  const row = db
    .prepare<[string], DecisionRow>(`SELECT ${DECISION_COLUMNS} FROM decisions WHERE email_id = ?`)
    .get(emailId);
  return row ? toDecision(row) : null;
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
  return {
    ...row,
    analysis: JSON.parse(row.analysis),
    injection: JSON.parse(row.injection),
    brake: row.brake === 1,
  };
}

function toExecution({ action, params, ...row }: ExecutionRow): Execution {
  return { ...row, proposal: { action, params: JSON.parse(params) } };
}
