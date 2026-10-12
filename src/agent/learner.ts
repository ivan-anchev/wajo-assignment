import type { Decision } from "../db/decisions.ts";
import type { Store } from "../db/store.ts";
import type { ActionName } from "../domain/actions.ts";
import {
  promotion,
  proposalOf,
  standingLevel,
  type FeedbackKind,
  type Level,
} from "../domain/policy.ts";
import type { SenderClass } from "../inbox/inbox.ts";

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
    response: FeedbackKind,
  ): Level | null {
    const feedback = {
      decisionId: decision.id,
      action: proposalOf(decision.analysis).action,
      senderClass,
      kind: response,
    };
    const { history, pin } = this.bucket(feedback.action, feedback.senderClass);
    this.store.feedback.insert(feedback);
    return promotion(feedback.action, history, feedback.kind, pin);
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
  ): { history: FeedbackKind[]; pin: Level | null } {
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
