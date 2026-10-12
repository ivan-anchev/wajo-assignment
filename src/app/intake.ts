import type { Agent, Event } from "../agent/agent.ts";
import type { Decision, NewDecision } from "../db/decisions.ts";
import type { Transcript } from "../db/reads.ts";
import type { Store } from "../db/store.ts";
import { proposalOf } from "../domain/policy.ts";
import { readInbox, type Email, type InboxSource } from "../inbox/inbox.ts";
import { execute } from "./execution.ts";

export class Intake {
  private readonly store: Store;
  private readonly agent: Agent;

  constructor(parts: { store: Store; agent: Agent }) {
    this.store = parts.store;
    this.agent = parts.agent;
  }

  async run(source: InboxSource): Promise<Transcript[]> {
    const transcripts: Transcript[] = [];

    for (const event of this.newEvents(source)) {
      const decided = await this.agent.decide(event);
      transcripts.push(this.recordAndAct(event.email, decided));
    }

    return transcripts;
  }

  private newEvents(source: InboxSource): Event[] {
    const decided = this.store.emails.listIds();

    return readInbox(source)
      .filter((email) => !decided.has(email.id))
      .map((email) => ({ kind: "incoming_email", email }));
  }

  private recordAndAct(email: Email, decided: NewDecision): Transcript {
    return this.store.transaction(() => {
      this.store.emails.insert(email);
      const decision = this.store.decisions.insert(decided);
      this.actOn(decision);
      return this.store.reads.transcript(decision);
    });
  }

  private actOn(decision: Decision): void {
    const proposal = proposalOf(decision.analysis);
    const item =
      decision.level === "silent"
        ? null
        : this.store.items.insert({ decisionId: decision.id, kind: decision.level, proposal });

    if (decision.level === "silent" || decision.level === "notify") {
      execute(this.store, decision, proposal, item?.id ?? null);
    }
  }
}
