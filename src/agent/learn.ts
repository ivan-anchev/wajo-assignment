import { bucketHistory, insertFeedback } from "../db/feedback.ts";
import type { Db } from "../db/open-db.ts";
import type { ActionName } from "../domain/actions.ts";
import { promotion } from "../domain/policy.ts";
import type { Feedback, Level, SenderClass } from "../domain/types.ts";

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

export function learn(db: Db, feedback: Omit<Feedback, "id" | "createdAt">): string | null {
  const history = bucketHistory(db, feedback.action, feedback.senderClass);
  insertFeedback(db, feedback);
  const from = promotion(feedback.action, history, feedback.kind);
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
