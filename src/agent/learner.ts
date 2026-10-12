import type { FeedbackLog } from "../db/feedback.ts";
import type { Pins } from "../db/pins.ts";
import type { Transcript } from "../db/reads.ts";
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
  constructor(private readonly tables: { feedback: FeedbackLog; pins: Pins }) {}

  record({ decision, email }: Transcript, kind: FeedbackKind): Level | null {
    if (decision.level === "escalate") {
      return null;
    }

    const action = proposalOf(decision.analysis).action;
    const { history, pin } = this.bucket(action, email.senderClass);

    this.tables.feedback.insert({
      decisionId: decision.id,
      action,
      senderClass: email.senderClass,
      kind,
    });

    return promotion(action, history, kind, pin);
  }

  pinBucket(action: ActionName, senderClass: SenderClass, level: Level): BucketStanding {
    this.tables.pins.upsert(action, senderClass, level);

    return this.bucketStanding(action, senderClass);
  }

  unpinBucket(action: ActionName, senderClass: SenderClass): BucketStanding {
    this.tables.pins.delete(action, senderClass);

    return this.bucketStanding(action, senderClass);
  }

  bucket(
    action: ActionName,
    senderClass: SenderClass,
  ): { history: FeedbackKind[]; pin: Level | null } {
    return {
      history: this.tables.feedback.listByBucket(action, senderClass),
      pin: this.tables.pins.find(action, senderClass),
    };
  }

  private bucketStanding(action: ActionName, senderClass: SenderClass): BucketStanding {
    const { history, pin } = this.bucket(action, senderClass);

    return { action, senderClass, pin, level: standingLevel(action, history, pin) };
  }
}
