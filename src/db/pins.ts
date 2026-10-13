import type { Database as Db } from "better-sqlite3";
import type { ActionName } from "../domain/actions.ts";
import type { Level } from "../domain/policy.ts";
import type { SenderClass } from "../inbox/inbox.ts";

export class Pins {
  constructor(private readonly db: Db) {}

  find(action: ActionName, senderClass: SenderClass): Level | null {
    return (
      this.db
        .prepare<[string, string], Level>(
          "SELECT level FROM pins WHERE action = ? AND sender_class = ?",
        )
        .pluck()
        .get(action, senderClass) ?? null
    );
  }

  list(): { action: ActionName; senderClass: SenderClass }[] {
    return this.db
      .prepare<[], { action: ActionName; senderClass: SenderClass }>(
        "SELECT action, sender_class AS senderClass FROM pins ORDER BY action, sender_class",
      )
      .all();
  }

  upsert(action: ActionName, senderClass: SenderClass, level: Level): void {
    this.db
      .prepare(
        `INSERT INTO pins (action, sender_class, level) VALUES (?, ?, ?)
         ON CONFLICT (action, sender_class) DO UPDATE SET level = excluded.level`,
      )
      .run(action, senderClass, level);
  }

  delete(action: ActionName, senderClass: SenderClass): void {
    this.db
      .prepare("DELETE FROM pins WHERE action = ? AND sender_class = ?")
      .run(action, senderClass);
  }
}
