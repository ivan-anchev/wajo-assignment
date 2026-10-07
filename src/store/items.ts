import { allowedResponses } from "../policy/index.ts";
import type { Item } from "../pipeline/index.ts";
import type { Db } from "./open-db.ts";

type ItemRow = Omit<Item, "proposal" | "allowedResponses"> & { proposal: string };

const COLUMNS =
  "id, decision_id AS decisionId, kind, status, proposal, created_at AS createdAt, resolved_at AS resolvedAt";

export function insertItem(db: Db, item: Pick<Item, "decisionId" | "kind" | "proposal">): Item {
  const row = db
    .prepare<[object], ItemRow>(
      `INSERT INTO items (decision_id, kind, proposal) VALUES (@decisionId, @kind, @proposal) RETURNING ${COLUMNS}`,
    )
    .get({ ...item, proposal: JSON.stringify(item.proposal) })!;
  return toItem(row);
}

export function findItemByDecision(db: Db, decisionId: number): Item | null {
  const row = db
    .prepare<[number], ItemRow>(`SELECT ${COLUMNS} FROM items WHERE decision_id = ?`)
    .get(decisionId);
  return row ? toItem(row) : null;
}

function toItem(row: ItemRow): Item {
  return {
    ...row,
    proposal: JSON.parse(row.proposal),
    allowedResponses: allowedResponses(row.kind),
  };
}
