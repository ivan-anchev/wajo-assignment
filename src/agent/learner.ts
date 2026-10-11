import type { Decision } from "../db/decisions.ts";
import type { Feedback } from "../db/feedback.ts";
import type { Store } from "../db/store.ts";
import type { ActionName } from "../domain/actions.ts";
import {
  promotion,
  proposalOf,
  standingLevel,
  type ItemResponse,
  type Level,
} from "../domain/policy.ts";
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

export type BucketStanding = {
  action: ActionName;
  senderClass: SenderClass;
  pin: Level | null;
  level: Level;
};

export class Learner {
  constructor(private readonly store: Store) {}

  recordResponse(
    decision: Decision,
    senderClass: SenderClass,
    response: ItemResponse,
  ): string | null {
    const feedback = {
      decisionId: decision.id,
      action: proposalOf(decision.analysis).action,
      senderClass,
      kind: response,
    };
    const { history, pin } = this.bucket(feedback.action, feedback.senderClass);
    this.store.feedback.insert(feedback);
    const promotedFrom = promotion(feedback.action, history, feedback.kind, pin);
    return promotedFrom && promotionMessage(feedback, promotedFrom);
  }

  pinBucket(action: ActionName, senderClass: SenderClass, level: Level): BucketStanding {
    this.store.pins.upsert(action, senderClass, level);

    return this.bucketStanding(action, senderClass);
  }

  unpinBucket(action: ActionName, senderClass: SenderClass): BucketStanding {
    this.store.pins.delete(action, senderClass);

    return this.bucketStanding(action, senderClass);
  }

  bucket(
    action: ActionName,
    senderClass: SenderClass,
  ): { history: ItemResponse[]; pin: Level | null } {
    return {
      history: this.store.feedback.listByBucket(action, senderClass),
      pin: this.store.pins.find(action, senderClass),
    };
  }

  private bucketStanding(action: ActionName, senderClass: SenderClass): BucketStanding {
    const { history, pin } = this.bucket(action, senderClass);

    return { action, senderClass, pin, level: standingLevel(action, history, pin) };
  }
}

function promotionMessage(
  { action, senderClass }: Pick<Feedback, "action" | "senderClass">,
  from: Level,
): string {
  const involvement = from === "ask" ? "asking" : "notifying you";
  return (
    `I will now ${actionPhrase(action, SENDERS[senderClass])} without ${involvement}. ` +
    `\`agent pin ${action} ${senderClass} ${from}\` keeps ${involvement}.`
  );
}

function actionPhrase(action: ActionName, senders: string): string {
  return WORDING[action]?.(senders) ?? `${action} ${senders}`;
}
