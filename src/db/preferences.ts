import type { Db } from "./store.ts";

export class Preferences {
  constructor(private readonly db: Db) {}

  get(): string {
    return this.db.prepare<[], string>("SELECT text FROM preferences WHERE id = 1").pluck().get()!;
  }

  getLines(): string[] {
    const text = this.get();
    return text ? text.split("\n") : [];
  }

  set(lines: string[]): void {
    this.db.prepare("UPDATE preferences SET text = ? WHERE id = 1").run(lines.join("\n"));
  }
}
