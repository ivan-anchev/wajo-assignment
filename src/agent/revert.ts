import { actionFor } from "../domain/actions.ts";
import { findDecision, transcriptOf } from "../db/decision-log.ts";
import type { Db } from "../db/open-db.ts";
import type { Execution, ResponseResult, Transcript } from "../domain/types.ts";
import { undoExecution } from "./act.ts";
import { learn } from "./learn.ts";
import { Refusal } from "./refusal.ts";

// A silent decision opens no item, so the user reverts it by decision id. It counts as an undo
// under the bucket, which steps the ladder from silent back to notify.
export function revert(db: Db, decisionId: number): ResponseResult {
  return db.transaction(() => {
    const { decision, email, execution } = silentExecution(db, decisionId);
    undoExecution(db, decision, execution);
    const promotion = learn(db, decision, email.senderClass, "undo");
    return { transcript: transcriptOf(db, decision), promotion, preference: null };
  })();
}

// Every non-silent decision, an injection-suspected one included, has an item and is refused here.
function silentExecution(db: Db, decisionId: number): Transcript & { execution: Execution } {
  const decision = findDecision(db, decisionId);
  if (!decision) {
    throw new Refusal(`There is no decision #${decisionId}.`);
  }
  const transcript = transcriptOf(db, decision);
  if (transcript.item) {
    const { id, kind, allowedResponses } = transcript.item;
    throw new Refusal(
      `Decision #${decisionId} has ${kind} item #${id}; it takes ${allowedResponses.join(", ")}.`,
    );
  }
  const [execution] = transcript.executions;
  if (!execution || actionFor(execution.proposal.action).inert) {
    throw new Refusal(`Decision #${decisionId} executed nothing to revert.`);
  }
  return { ...transcript, execution };
}
