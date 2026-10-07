import type { ActionName } from "../actions/index.ts";
import type { Execution } from "../pipeline/index.ts";
import type { Db } from "./open-db.ts";

type ExecutionRow = Omit<Execution, "proposal"> & { action: ActionName; params: string };

const COLUMNS =
  "id, decision_id AS decisionId, item_id AS itemId, action, params, executed_at AS executedAt, undone_at AS undoneAt";

// executedAt comes from the caller: the same `now` the action wrote with.
export function insertExecution(
  db: Db,
  execution: Pick<Execution, "decisionId" | "itemId" | "proposal" | "executedAt">,
): Execution {
  const row = db
    .prepare<[object], ExecutionRow>(
      `INSERT INTO executions (decision_id, item_id, action, params, executed_at)
       VALUES (@decisionId, @itemId, @action, @params, @executedAt) RETURNING ${COLUMNS}`,
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

export function listExecutionsByDecision(db: Db, decisionId: number): Execution[] {
  return db
    .prepare<[number], ExecutionRow>(
      `SELECT ${COLUMNS} FROM executions WHERE decision_id = ? ORDER BY id`,
    )
    .all(decisionId)
    .map(toExecution);
}

function toExecution({ action, params, ...row }: ExecutionRow): Execution {
  return { ...row, proposal: { action, params: JSON.parse(params) } };
}
