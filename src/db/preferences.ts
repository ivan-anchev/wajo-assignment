import type { Db } from "./open-db.ts";

export function readPreferences(db: Db): string {
  return db.prepare<[], string>("SELECT text FROM preferences WHERE id = 1").pluck().get()!;
}

export function appendPreference(db: Db, line: string): void {
  db.prepare(
    `UPDATE preferences
     SET text = CASE text WHEN '' THEN @line ELSE text || char(10) || @line END
     WHERE id = 1`,
  ).run({ line });
}
