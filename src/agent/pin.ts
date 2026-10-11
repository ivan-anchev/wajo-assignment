import { actionFor, type ActionName } from "../domain/actions.ts";
import { floor, isBelow, standingLevel } from "../domain/policy.ts";
import type { BucketStanding, Level, SenderClass } from "../domain/types.ts";
import type { Store } from "../db/store.ts";
import { Refusal } from "./refusal.ts";

export function pin(
  store: Store,
  action: ActionName,
  senderClass: SenderClass,
  level: Level,
): BucketStanding {
  refuseBelowFloor(action, level);

  store.pins.upsert(action, senderClass, level);

  return standingOf(store, action, senderClass);
}

export function unpin(store: Store, action: ActionName, senderClass: SenderClass): BucketStanding {
  store.pins.delete(action, senderClass);

  return standingOf(store, action, senderClass);
}

function refuseBelowFloor(action: ActionName, level: Level): void {
  const least = floor([action], false);

  if (isBelow(level, least)) {
    throw new Refusal(
      `${action} is ${actionFor(action).riskClass} and never runs below ${least}; a pin can only raise it.`,
    );
  }
}

function standingOf(store: Store, action: ActionName, senderClass: SenderClass): BucketStanding {
  const pinned = store.pins.find(action, senderClass);
  const history = store.feedback.listByBucket(action, senderClass);

  return { action, senderClass, pin: pinned, level: standingLevel(action, history, pinned) };
}
