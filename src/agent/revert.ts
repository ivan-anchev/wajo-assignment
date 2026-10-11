import { actionFor } from "../domain/actions.ts";
import type { Store } from "../db/store.ts";
import type { Execution, ResponseResult, Transcript } from "../domain/types.ts";
import { undoExecution } from "./act.ts";
import { learn } from "./learn.ts";
import { Refusal } from "./respond.ts";

// A silent decision opens no item, so the user reverts it by decision id. It counts as an undo
// under the bucket, which steps the ladder from silent back to notify.
export function revert(store: Store, decisionId: number): ResponseResult {
  return store.transaction(() => {
    const { decision, email, execution } = silentExecution(store, decisionId);
    undoExecution(store, decision, execution);

    const promotion = learn(store, decision, email.senderClass, "undo");

    return { transcript: store.transcript(decision), promotion, preference: null };
  });
}

// Every non-silent decision, an injection-suspected one included, has an item and is refused here.
function silentExecution(store: Store, decisionId: number): Transcript & { execution: Execution } {
  const decision = store.decisions.find(decisionId);
  if (!decision) {
    throw new Refusal(`There is no decision #${decisionId}.`);
  }

  const transcript = store.transcript(decision);
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

  if (execution.undoneAt) {
    throw new Refusal(`Decision #${decisionId} is already undone.`);
  }

  return { ...transcript, execution };
}
