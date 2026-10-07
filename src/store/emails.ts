import type { Email, EmailState } from "../mail/index.ts";
import type { Db } from "./open-db.ts";

type EmailStateRow = Omit<EmailState, "labels"> & { labels: string };

export function insertEmail(db: Db, email: Email): void {
  db.prepare(
    `INSERT INTO emails (id, thread_id, from_address, to_address, subject, body, headers, received_at, sender_class)
     VALUES (@id, @threadId, @from, @to, @subject, @body, @headers, @receivedAt, @senderClass)`,
  ).run({ ...email, headers: JSON.stringify(email.headers) });
}

export function storedEmailIds(db: Db): Set<string> {
  return new Set(db.prepare<[], string>("SELECT id FROM emails").pluck().all());
}

export function readEmailState(db: Db, id: string): EmailState {
  const row = db
    .prepare<[string], EmailStateRow>(
      "SELECT archived_at AS archivedAt, read_at AS readAt, snoozed_until AS snoozedUntil, labels FROM emails WHERE id = ?",
    )
    .get(id)!;
  return { ...row, labels: JSON.parse(row.labels) };
}

export function updateEmailState(db: Db, id: string, patch: Partial<EmailState>): void {
  const next = { ...readEmailState(db, id), ...patch };
  db.prepare(
    `UPDATE emails SET archived_at = @archivedAt, read_at = @readAt, snoozed_until = @snoozedUntil, labels = @labels
     WHERE id = @id`,
  ).run({ ...next, labels: JSON.stringify(next.labels), id });
}
