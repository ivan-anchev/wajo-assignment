import { ALLOWED_RESPONSES } from "../domain/policy.ts";
import type { Item, ItemStatus } from "../domain/types.ts";
import type { Proposal } from "../domain/actions.ts";
import type { Db } from "./open-db.ts";

type ItemRow = Omit<Item, "proposal" | "allowedResponses"> & { proposal: string };

const ITEM_COLUMNS =
  "id, decision_id AS decisionId, kind, status, proposal, created_at AS createdAt, resolved_at AS resolvedAt";

export function insertItem(db: Db, item: Pick<Item, "decisionId" | "kind" | "proposal">): Item {
  const row = db
    .prepare<[object], ItemRow>(
      `INSERT INTO items (decision_id, kind, proposal) VALUES (@decisionId, @kind, @proposal) RETURNING ${ITEM_COLUMNS}`,
    )
    .get({ ...item, proposal: JSON.stringify(item.proposal) })!;
  return toItem(row);
}

export function findItem(db: Db, id: number): Item | null {
  const row = db
    .prepare<[number], ItemRow>(`SELECT ${ITEM_COLUMNS} FROM items WHERE id = ?`)
    .get(id);
  return row ? toItem(row) : null;
}

export function findItemByDecision(db: Db, decisionId: number): Item | null {
  const row = db
    .prepare<[number], ItemRow>(`SELECT ${ITEM_COLUMNS} FROM items WHERE decision_id = ?`)
    .get(decisionId);
  return row ? toItem(row) : null;
}

export function resolveItem(
  db: Db,
  id: number,
  resolution: { status: Exclude<ItemStatus, "open">; proposal: Proposal },
): boolean {
  const { changes } = db
    .prepare(
      `UPDATE items SET status = @status, proposal = @proposal,
              resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = @id AND status = 'open'`,
    )
    .run({ id, status: resolution.status, proposal: JSON.stringify(resolution.proposal) });
  return changes === 1;
}

function toItem(row: ItemRow): Item {
  return {
    ...row,
    proposal: JSON.parse(row.proposal),
    allowedResponses: ALLOWED_RESPONSES[row.kind],
  };
}
