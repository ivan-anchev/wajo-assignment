import type { LanguageModel } from "ai";
import { findTranscript, insertDecision } from "../db/decision-log.ts";
import { insertEmail, storedEmailIds } from "../db/mailbox.ts";
import type { Db } from "../db/open-db.ts";
import { readInbox, type InboxSource } from "../inbox/inbox.ts";
import { levelFor } from "../domain/policy.ts";
import { act } from "./act.ts";
import { analyze } from "./analyze.ts";
import { checkInjection } from "./check-injection.ts";
import type { Decision, Email, Event, Transcript } from "../domain/types.ts";

export function createAgent(db: Db, llm: LanguageModel) {
  return {
    async run(source: InboxSource): Promise<Transcript[]> {
      const transcripts: Transcript[] = [];
      for (const event of intake(db, source)) {
        transcripts.push(await processEvent(db, llm, event));
      }
      return transcripts;
    },

    transcript(emailId: string): Transcript | null {
      return findTranscript(db, emailId);
    },
  };
}

export type Agent = ReturnType<typeof createAgent>;

// Intake does not store emails; processEvent stores each one together with its
// decision. An id in `emails` therefore means "decided", and an email whose
// analysis failed is simply picked up again on the next run.
function intake(db: Db, source: InboxSource): Event[] {
  const decided = storedEmailIds(db);
  return readInbox(source)
    .filter((email) => !decided.has(email.id))
    .map((email) => ({ kind: "incoming_email", email }));
}

// Two phases: an async think phase that writes nothing, then one synchronous
// transaction (better-sqlite3 rejects async callbacks), so an email is either
// fully decided or absent.
async function processEvent(db: Db, llm: LanguageModel, event: Event): Promise<Transcript> {
  const { email } = event;
  const analysis = await analyze(llm, email);
  const injection = await checkInjection(llm, email);
  const { floor, level } = levelFor(analysis.proposal, injection);
  return commit(db, email, { emailId: email.id, analysis, injection, floor, level });
}

function commit(db: Db, email: Email, decided: Omit<Decision, "id" | "createdAt">): Transcript {
  return db.transaction(() => {
    insertEmail(db, email);
    const decision = insertDecision(db, decided);
    return { email, decision, ...act(db, decision) };
  })();
}
