import { ALLOWED_RESPONSES } from "../domain/policy.ts";
import type { Item, ItemStatus } from "../domain/types.ts";
import type { Proposal } from "../domain/actions.ts";
import type { Db } from "./store.ts";

type ItemRow = Omit<Item, "proposal" | "allowedResponses"> & { proposal: string };

const COLUMNS =
  "id, decision_id AS decisionId, kind, status, proposal, created_at AS createdAt, resolved_at AS resolvedAt";

export class Items {
  constructor(private readonly db: Db) {}

  insert(item: Pick<Item, "decisionId" | "kind" | "proposal">): Item {
    const row = this.db
      .prepare<[object], ItemRow>(
        `INSERT INTO items (decision_id, kind, proposal) VALUES (@decisionId, @kind, @proposal) RETURNING ${COLUMNS}`,
      )
      .get({ ...item, proposal: JSON.stringify(item.proposal) })!;
    return toItem(row);
  }

  find(id: number): Item | null {
    const row = this.db
      .prepare<[number], ItemRow>(`SELECT ${COLUMNS} FROM items WHERE id = ?`)
      .get(id);
    return row ? toItem(row) : null;
  }

  findByDecision(decisionId: number): Item | null {
    const row = this.db
      .prepare<[number], ItemRow>(`SELECT ${COLUMNS} FROM items WHERE decision_id = ?`)
      .get(decisionId);
    return row ? toItem(row) : null;
  }

  update(
    id: number,
    resolution: { status: Exclude<ItemStatus, "open">; proposal: Proposal },
  ): void {
    this.db
      .prepare(
        `UPDATE items SET status = @status, proposal = @proposal,
                resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = @id AND status = 'open'`,
      )
      .run({ id, status: resolution.status, proposal: JSON.stringify(resolution.proposal) });
  }
}

function toItem(row: ItemRow): Item {
  return {
    ...row,
    proposal: JSON.parse(row.proposal),
    allowedResponses: ALLOWED_RESPONSES[row.kind],
  };
}
