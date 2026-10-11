import type { ActionName } from "../domain/actions.ts";
import type { Feedback, ItemResponse, SenderClass } from "../domain/types.ts";
import type { Db } from "./store.ts";

const COLUMNS =
  "id, decision_id AS decisionId, action, sender_class AS senderClass, kind, created_at AS createdAt";

export class FeedbackLog {
  constructor(private readonly db: Db) {}

  insert(feedback: Omit<Feedback, "id" | "createdAt">): void {
    this.db
      .prepare(
        `INSERT INTO feedback (decision_id, action, sender_class, kind)
         VALUES (@decisionId, @action, @senderClass, @kind)`,
      )
      .run(feedback);
  }

  findByDecision(decisionId: number): Feedback | null {
    return (
      this.db
        .prepare<[number], Feedback>(`SELECT ${COLUMNS} FROM feedback WHERE decision_id = ?`)
        .get(decisionId) ?? null
    );
  }

  listByBucket(action: ActionName, senderClass: SenderClass): ItemResponse[] {
    return this.db
      .prepare<[string, string], ItemResponse>(
        "SELECT kind FROM feedback WHERE action = ? AND sender_class = ? ORDER BY id",
      )
      .pluck()
      .all(action, senderClass);
  }
}
