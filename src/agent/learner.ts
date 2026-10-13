import type { FeedbackLog } from "../db/feedback.ts";
import type { Pins } from "../db/pins.ts";
import type { Transcript } from "../db/reads.ts";
import type { ActionName } from "../domain/actions.ts";
import { promotion, proposalOf, type FeedbackKind, type Level } from "../domain/policy.ts";
import type { SenderClass } from "../inbox/inbox.ts";

export class Learner {
  constructor(private readonly tables: { feedback: FeedbackLog; pins: Pins }) {}

  // Every bucket with a history or a pin, each once.
  buckets(): { action: ActionName; senderClass: SenderClass }[] {
    const all = [...this.tables.feedback.listBuckets(), ...this.tables.pins.list()];
    return all.filter(
      (bucket, index) =>
        all.findIndex(
          (other) => other.action === bucket.action && other.senderClass === bucket.senderClass,
        ) === index,
    );
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
}
