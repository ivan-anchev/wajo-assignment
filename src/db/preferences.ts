import type { Db } from "./open-db.ts";

export function readPreferences(db: Db): string {
  return db.prepare<[], string>("SELECT text FROM preferences WHERE id = 1").pluck().get()!;
}

export function readPreferenceLines(db: Db): string[] {
  const text = readPreferences(db);
  return text ? text.split("\n") : [];
}

export function writePreferences(db: Db, lines: string[]): void {
  db.prepare("UPDATE preferences SET text = ? WHERE id = 1").run(lines.join("\n"));
}
