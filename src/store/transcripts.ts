import type { Transcript } from "../pipeline/index.ts";
import { findDecisionByEmail } from "./decisions.ts";
import { getEmail } from "./emails.ts";
import { listExecutionsByDecision } from "./executions.ts";
import { findItemByDecision } from "./items.ts";
import type { Db } from "./open-db.ts";

// Starts from the decision: an email row exists only alongside its decision.
export function findTranscript(db: Db, emailId: string): Transcript | null {
  const decision = findDecisionByEmail(db, emailId);
  if (!decision) {
    return null;
  }
  return {
    email: getEmail(db, emailId),
    decision,
    item: findItemByDecision(db, decision.id),
    executions: listExecutionsByDecision(db, decision.id),
  };
}
