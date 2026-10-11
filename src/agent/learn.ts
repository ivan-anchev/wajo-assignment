import type { Decision } from "../db/decisions.ts";
import type { Feedback } from "../db/feedback.ts";
import type { Store } from "../db/store.ts";
import type { ActionName } from "../domain/actions.ts";
import { promotion, proposalOf, type ItemResponse, type Level } from "../domain/policy.ts";
import type { SenderClass } from "../inbox/inbox.ts";

const SENDERS: Record<SenderClass, string> = {
  internal: "emails from colleagues",
  known: "emails from your contacts",
  newsletter: "newsletters",
  first_contact: "emails from first-time senders",
};

const WORDING: Partial<Record<ActionName, (senders: string) => string>> = {
  mark_read: (senders) => `mark ${senders} as read`,
  draft_reply: (senders) => `draft replies to ${senders}`,
};

export function learn(
  store: Store,
  decision: Decision,
  senderClass: SenderClass,
  kind: ItemResponse,
): string | null {
  const feedback = {
    decisionId: decision.id,
    action: proposalOf(decision.analysis).action,
    senderClass,
    kind,
  };
  const history = store.feedback.listByBucket(feedback.action, feedback.senderClass);
  const pin = store.pins.find(feedback.action, feedback.senderClass);
  store.feedback.insert(feedback);
  const from = promotion(feedback.action, history, feedback.kind, pin);
  return from && announce(feedback, from);
}

function announce(
  { action, senderClass }: Pick<Feedback, "action" | "senderClass">,
  from: Level,
): string {
  const involvement = from === "ask" ? "asking" : "notifying you";
  return (
    `I will now ${doing(action, SENDERS[senderClass])} without ${involvement}. ` +
    `\`agent pin ${action} ${senderClass} ${from}\` keeps ${involvement}.`
  );
}

function doing(action: ActionName, senders: string): string {
  return WORDING[action]?.(senders) ?? `${action} ${senders}`;
}
