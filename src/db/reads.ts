import type { Email } from "../inbox/inbox.ts";
import type { Decision, Decisions } from "./decisions.ts";
import type { Execution, Executions } from "./executions.ts";
import type { Feedback, FeedbackLog } from "./feedback.ts";
import type { Item, Items } from "./items.ts";
import type { Mailbox } from "./mailbox.ts";
import type { Preferences } from "./preferences.ts";

export type Transcript = {
  email: Email;
  decision: Decision;
  item: Item | null;
  executions: Execution[];
  feedback: Feedback | null;
};

type ReadTables = {
  emails: Mailbox;
  decisions: Decisions;
  items: Items;
  executions: Executions;
  feedback: FeedbackLog;
  preferences: Preferences;
};

export class Reads {
  constructor(private readonly tables: ReadTables) {}

  transcript(decision: Decision): Transcript {
    return {
      email: this.tables.emails.get(decision.emailId),
      decision,
      item: this.tables.items.findByDecision(decision.id),
      executions: this.tables.executions.listByDecision(decision.id),
      feedback: this.tables.feedback.findByDecision(decision.id),
    };
  }

  findTranscript(emailId: string): Transcript | null {
    const decision = this.tables.decisions.findByEmail(emailId);

    return decision ? this.transcript(decision) : null;
  }

  openTranscripts(): Transcript[] {
    return this.tables.decisions.listOpen().map((decision) => this.transcript(decision));
  }

  recentTranscripts(limit: number): Transcript[] {
    return this.tables.decisions.listRecent(limit).map((decision) => this.transcript(decision));
  }

  preferences(): string {
    return this.tables.preferences.get();
  }
}
