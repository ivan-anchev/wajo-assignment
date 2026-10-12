import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { Decisions } from "./decisions.ts";
import { Executions } from "./executions.ts";
import { FeedbackLog } from "./feedback.ts";
import { Items } from "./items.ts";
import { Mailbox } from "./mailbox.ts";
import { Pins } from "./pins.ts";
import { Preferences } from "./preferences.ts";
import { Reads } from "./reads.ts";

const SCHEMA = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");

export class Store {
  readonly emails: Mailbox;
  readonly decisions: Decisions;
  readonly executions: Executions;
  readonly items: Items;
  readonly feedback: FeedbackLog;
  readonly pins: Pins;
  readonly preferences: Preferences;
  readonly reads: Reads;

  static open(path: string): Store {
    const db = new Database(path);
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA);
    return new Store(db);
  }

  private constructor(readonly db: Database.Database) {
    this.emails = new Mailbox(db);
    this.decisions = new Decisions(db);
    this.executions = new Executions(db);
    this.items = new Items(db);
    this.feedback = new FeedbackLog(db);
    this.pins = new Pins(db);
    this.preferences = new Preferences(db);
    this.reads = new Reads(this);
  }

  transaction<T>(work: () => T): T {
    return this.db.transaction(work)();
  }
}
