import type { Db } from "./open-db.ts";

export function saveDraft(db: Db, emailId: string, body: string): void {
  db.prepare(
    "INSERT INTO drafts (email_id, body) VALUES (?, ?) ON CONFLICT(email_id) DO UPDATE SET body = excluded.body",
  ).run(emailId, body);
}

export function deleteDraft(db: Db, emailId: string): void {
  db.prepare("DELETE FROM drafts WHERE email_id = ?").run(emailId);
}
