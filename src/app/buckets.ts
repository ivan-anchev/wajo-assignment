import type { Learner } from "../agent/learner.ts";
import type { Pins } from "../db/pins.ts";
import { actionFor, type ActionName } from "../domain/actions.ts";
import { floor, isBelow, standingLevel, type Level } from "../domain/policy.ts";
import type { SenderClass } from "../inbox/inbox.ts";
import { Refusal } from "./refusal.ts";

export type BucketStanding = {
  action: ActionName;
  senderClass: SenderClass;
  pin: Level | null;
  level: Level;
};

export class Buckets {
  private readonly pins: Pins;
  private readonly learner: Learner;

  constructor(parts: { pins: Pins; learner: Learner }) {
    this.pins = parts.pins;
    this.learner = parts.learner;
  }

  pin(action: ActionName, senderClass: SenderClass, level: Level): BucketStanding {
    refusePinBelowFloor(action, level);

    this.pins.upsert(action, senderClass, level);

    return this.standing(action, senderClass);
  }

  unpin(action: ActionName, senderClass: SenderClass): BucketStanding {
    this.pins.delete(action, senderClass);

    return this.standing(action, senderClass);
  }

  private standing(action: ActionName, senderClass: SenderClass): BucketStanding {
    const { history, pin } = this.learner.bucket(action, senderClass);

    return { action, senderClass, pin, level: standingLevel(action, history, pin) };
  }
}

function refusePinBelowFloor(action: ActionName, level: Level): void {
  const least = floor([action], []);

  if (isBelow(level, least)) {
    throw new Refusal(
      `${action} is ${actionFor(action).riskClass} and never runs below ${least}; a pin can only raise it.`,
    );
  }
}
