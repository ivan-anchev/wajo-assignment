import type { LanguageModel } from "ai";
import type { Email } from "../mail/index.ts";
import { insertDecision, insertEmail, type Db } from "../store/index.ts";
import { act } from "./act.ts";
import { analyze } from "./analyze.ts";
import { checkInjection } from "./check-injection.ts";
import { decideLevel } from "./decide-level.ts";
import type { Decision, Event, Transcript } from "./records.model.ts";

// Two phases: an async think phase that writes nothing, then one synchronous
// transaction (better-sqlite3 rejects async callbacks), so an email is either
// fully decided or absent.
export async function processEvent(db: Db, llm: LanguageModel, event: Event): Promise<Transcript> {
  const { email } = event;
  const analysis = await analyze(llm, email);
  const injection = await checkInjection(llm, email);
  const { floor, level } = decideLevel(analysis.proposal, injection);
  return commit(db, email, { emailId: email.id, analysis, injection, floor, level });
}

function commit(db: Db, email: Email, decided: Omit<Decision, "id" | "createdAt">): Transcript {
  return db.transaction(() => {
    insertEmail(db, email);
    const decision = insertDecision(db, decided);
    return { email, decision, ...act(db, decision) };
  })();
}
