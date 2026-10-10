import type { ActionName } from "../domain/actions.ts";
import type { Feedback, ItemResponse, SenderClass } from "../domain/types.ts";
import type { Db } from "./open-db.ts";

const FEEDBACK_COLUMNS =
  "id, decision_id AS decisionId, action, sender_class AS senderClass, kind, created_at AS createdAt";

export function insertFeedback(db: Db, feedback: Omit<Feedback, "id" | "createdAt">): void {
  db.prepare(
    `INSERT INTO feedback (decision_id, action, sender_class, kind)
     VALUES (@decisionId, @action, @senderClass, @kind)`,
  ).run(feedback);
}

export function findFeedbackByDecision(db: Db, decisionId: number): Feedback | null {
  return (
    db
      .prepare<[number], Feedback>(`SELECT ${FEEDBACK_COLUMNS} FROM feedback WHERE decision_id = ?`)
      .get(decisionId) ?? null
  );
}

export function bucketHistory(
  db: Db,
  action: ActionName,
  senderClass: SenderClass,
): ItemResponse[] {
  return db
    .prepare<[string, string], ItemResponse>(
      "SELECT kind FROM feedback WHERE action = ? AND sender_class = ? ORDER BY id",
    )
    .pluck()
    .all(action, senderClass);
}
