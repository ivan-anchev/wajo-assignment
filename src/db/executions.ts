import type { ActionName } from "../domain/actions.ts";
import type { Execution } from "../domain/types.ts";
import type { Db } from "./store.ts";

type ExecutionRow = Omit<Execution, "proposal"> & { action: ActionName; params: string };

const COLUMNS =
  "id, decision_id AS decisionId, item_id AS itemId, action, params, executed_at AS executedAt, undone_at AS undoneAt";

export class Executions {
  constructor(private readonly db: Db) {}

  insert(
    execution: Pick<Execution, "decisionId" | "itemId" | "proposal" | "executedAt">,
  ): Execution {
    const row = this.db
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

  findByItem(itemId: number): Execution {
    const row = this.db
      .prepare<[number], ExecutionRow>(`SELECT ${COLUMNS} FROM executions WHERE item_id = ?`)
      .get(itemId)!;
    return toExecution(row);
  }

  listByDecision(decisionId: number): Execution[] {
    return this.db
      .prepare<[number], ExecutionRow>(
        `SELECT ${COLUMNS} FROM executions WHERE decision_id = ? ORDER BY id`,
      )
      .all(decisionId)
      .map(toExecution);
  }

  update(id: number, { undoneAt }: Pick<Execution, "undoneAt">): void {
    this.db.prepare("UPDATE executions SET undone_at = ? WHERE id = ?").run(undoneAt, id);
  }
}

function toExecution({ action, params, ...row }: ExecutionRow): Execution {
  return { ...row, proposal: { action, params: JSON.parse(params) } };
}
