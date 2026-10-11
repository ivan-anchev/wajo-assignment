import type { Database as Db } from "better-sqlite3";
import type { Proposal } from "../domain/actions.ts";
import type { ItemResponse, Level } from "../domain/policy.ts";

type ItemKind = Exclude<Level, "silent">;
export type ItemStatus = "open" | "approved" | "rejected" | "dismissed" | "undone";

export type Item = {
  id: number;
  decisionId: number;
  kind: ItemKind;
  status: ItemStatus;
  // Own copy: `edit` rewrites it without touching the decision.
  proposal: Proposal;
  createdAt: string;
  resolvedAt: string | null;
  // Derived from `kind` when read, never stored. `status` says whether it is still open.
  allowedResponses: readonly ItemResponse[];
};

const ALLOWED_RESPONSES: Record<ItemKind, readonly ItemResponse[]> = {
  ask: ["approve", "edit", "reject"],
  notify: ["dismiss", "undo"],
  escalate: ["dismiss"],
};

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
