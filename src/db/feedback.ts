import type { Feedback } from "../domain/types.ts";
import type { Db } from "./open-db.ts";

const FEEDBACK_COLUMNS =
  "id, item_id AS itemId, action, sender_class AS senderClass, kind, created_at AS createdAt";

export function insertFeedback(db: Db, feedback: Omit<Feedback, "id" | "createdAt">): void {
  db.prepare(
    `INSERT INTO feedback (item_id, action, sender_class, kind)
     VALUES (@itemId, @action, @senderClass, @kind)`,
  ).run(feedback);
}

export function findFeedbackByItem(db: Db, itemId: number): Feedback | null {
  return (
    db
      .prepare<[number], Feedback>(`SELECT ${FEEDBACK_COLUMNS} FROM feedback WHERE item_id = ?`)
      .get(itemId) ?? null
  );
}
