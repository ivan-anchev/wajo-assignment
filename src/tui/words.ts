import type { Transcript } from "../db/reads.ts";
import type { ActionName } from "../domain/actions.ts";
import { isBelow, proposalOf } from "../domain/policy.ts";
import type { SenderClass } from "../inbox/inbox.ts";

const DONE: Record<ActionName, string> = {
  none: "Left in the inbox",
  archive: "Archived",
  mark_read: "Marked read",
  snooze: "Snoozed",
  label: "Labelled",
  draft_reply: "Drafted a reply",
  send_reply: "Sent a reply",
  forward: "Forwarded",
  unsubscribe: "Unsubscribed",
  delete_permanently: "Deleted for good",
  pay_invoice: "Paid",
};

const CHOICE: Record<ActionName, string> = {
  none: "Leave it in the inbox",
  archive: "Archive",
  mark_read: "Mark read",
  snooze: "Snooze",
  label: "Label",
  draft_reply: "Draft a reply",
  send_reply: "Send a reply",
  forward: "Forward",
  unsubscribe: "Unsubscribe",
  delete_permanently: "Delete for good",
  pay_invoice: "Pay the invoice",
};

export function actionWords(action: ActionName): string {
  return action.replaceAll("_", " ");
}

export function doneWords(action: ActionName): string {
  return DONE[action];
}

export function choiceWords(action: ActionName): string {
  return CHOICE[action];
}

export function senderWords(senderClass: SenderClass): string {
  return senderClass.replaceAll("_", " ");
}

export function bucketWords(action: ActionName, senderClass: SenderClass): string {
  return `${actionWords(action)} · ${senderWords(senderClass)}`;
}

export function whatIWant({ decision, item }: Transcript): string {
  if (decision.injection.suspected) {
    return "Injection suspected";
  }
  if (decision.payment.suspected) {
    return "Asks for a payment";
  }
  const action = (item?.proposal ?? proposalOf(decision.analysis)).action;
  return isBelow(decision.level, "ask") ? doneWords(action) : `Wants to ${actionWords(action)}`;
}

export function outcomeWords({ item, feedback }: Transcript): string | null {
  return item?.status ?? (feedback ? "corrected" : null);
}
