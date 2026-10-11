import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import type { Decision, Transcript } from "../domain/types.ts";
import { Decisions } from "./decisions.ts";
import { Executions } from "./executions.ts";
import { FeedbackLog } from "./feedback.ts";
import { Items } from "./items.ts";
import { Mailbox } from "./mailbox.ts";
import { Pins } from "./pins.ts";
import { Preferences } from "./preferences.ts";

export type Db = Database.Database;

const SCHEMA = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");

export class Store {
  readonly emails: Mailbox;
  readonly decisions: Decisions;
  readonly executions: Executions;
  readonly items: Items;
  readonly feedback: FeedbackLog;
  readonly pins: Pins;
  readonly preferences: Preferences;

  static open(path: string): Store {
    const db = new Database(path);
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA);
    return new Store(db);
  }

  private constructor(readonly db: Db) {
    this.emails = new Mailbox(db);
    this.decisions = new Decisions(db);
    this.executions = new Executions(db);
    this.items = new Items(db);
    this.feedback = new FeedbackLog(db);
    this.pins = new Pins(db);
    this.preferences = new Preferences(db);
  }

  transaction<T>(work: () => T): T {
    return this.db.transaction(work)();
  }

  transcript(decision: Decision): Transcript {
    return {
      email: this.emails.get(decision.emailId),
      decision,
      item: this.items.findByDecision(decision.id),
      executions: this.executions.listByDecision(decision.id),
      feedback: this.feedback.findByDecision(decision.id),
    };
  }

  findTranscript(emailId: string): Transcript | null {
    const decision = this.decisions.findByEmail(emailId);
    return decision ? this.transcript(decision) : null;
  }

  openTranscripts(): Transcript[] {
    return this.decisions.listOpen().map((decision) => this.transcript(decision));
  }

  recentTranscripts(limit: number): Transcript[] {
    return this.decisions.listRecent(limit).map((decision) => this.transcript(decision));
  }
}
