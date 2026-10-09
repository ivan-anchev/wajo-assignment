import type { ActionName } from "../domain/actions.ts";
import type { Level, SenderClass } from "../domain/types.ts";
import type { Db } from "./open-db.ts";

export function findPin(db: Db, action: ActionName, senderClass: SenderClass): Level | null {
  return (
    db
      .prepare<[string, string], Level>(
        "SELECT level FROM pins WHERE action = ? AND sender_class = ?",
      )
      .pluck()
      .get(action, senderClass) ?? null
  );
}

export function savePin(db: Db, action: ActionName, senderClass: SenderClass, level: Level): void {
  db.prepare(
    `INSERT INTO pins (action, sender_class, level) VALUES (?, ?, ?)
     ON CONFLICT (action, sender_class) DO UPDATE SET level = excluded.level`,
  ).run(action, senderClass, level);
}

export function deletePin(db: Db, action: ActionName, senderClass: SenderClass): void {
  db.prepare("DELETE FROM pins WHERE action = ? AND sender_class = ?").run(action, senderClass);
}
