import type { Database as Db } from "better-sqlite3";
import type { Email } from "../inbox/inbox.ts";

type EmailState = {
  archivedAt: string | null;
  readAt: string | null;
  snoozedUntil: string | null;
  labels: string[];
};

type EmailRow = Omit<Email, "headers"> & { headers: string };
type EmailStateRow = Omit<EmailState, "labels"> & { labels: string };

export class Mailbox {
  constructor(private readonly db: Db) {}

  insert(email: Email): void {
    this.db
      .prepare(
        `INSERT INTO emails (id, thread_id, from_address, to_address, subject, body, headers, received_at, sender_class)
         VALUES (@id, @threadId, @from, @to, @subject, @body, @headers, @receivedAt, @senderClass)`,
      )
      .run({ ...email, headers: JSON.stringify(email.headers) });
  }

  get(id: string): Email {
    const row = this.db
      .prepare<[string], EmailRow>(
        `SELECT id, thread_id AS threadId, from_address AS "from", to_address AS "to", subject, body, headers,
                received_at AS receivedAt, sender_class AS senderClass
         FROM emails WHERE id = ?`,
      )
      .get(id)!;
    return { ...row, headers: JSON.parse(row.headers) };
  }

  listIds(): Set<string> {
    return new Set(this.db.prepare<[], string>("SELECT id FROM emails").pluck().all());
  }

  getState(id: string): EmailState {
    const row = this.db
      .prepare<[string], EmailStateRow>(
        "SELECT archived_at AS archivedAt, read_at AS readAt, snoozed_until AS snoozedUntil, labels FROM emails WHERE id = ?",
      )
      .get(id)!;
    return { ...row, labels: JSON.parse(row.labels) };
  }

  update(id: string, patch: Partial<EmailState>): void {
    const next = { ...this.getState(id), ...patch };
    this.db
      .prepare(
        `UPDATE emails SET archived_at = @archivedAt, read_at = @readAt, snoozed_until = @snoozedUntil, labels = @labels
         WHERE id = @id`,
      )
      .run({ ...next, labels: JSON.stringify(next.labels), id });
  }

  upsertDraft(emailId: string, body: string): void {
    this.db
      .prepare(
        "INSERT INTO drafts (email_id, body) VALUES (?, ?) ON CONFLICT(email_id) DO UPDATE SET body = excluded.body",
      )
      .run(emailId, body);
  }

  deleteDraft(emailId: string): void {
    this.db.prepare("DELETE FROM drafts WHERE email_id = ?").run(emailId);
  }
}
