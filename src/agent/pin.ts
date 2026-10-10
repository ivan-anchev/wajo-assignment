import { actionFor, type ActionName } from "../domain/actions.ts";
import { floor, isBelow, standingLevel } from "../domain/policy.ts";
import type { BucketStanding, Level, SenderClass } from "../domain/types.ts";
import { bucketHistory } from "../db/feedback.ts";
import type { Db } from "../db/open-db.ts";
import { deletePin, findPin, savePin } from "../db/pins.ts";
import { Refusal } from "./refusal.ts";

export function pin(
  db: Db,
  action: ActionName,
  senderClass: SenderClass,
  level: Level,
): BucketStanding {
  refuseBelowFloor(action, level);
  savePin(db, action, senderClass, level);
  return standingOf(db, action, senderClass);
}

export function unpin(db: Db, action: ActionName, senderClass: SenderClass): BucketStanding {
  deletePin(db, action, senderClass);
  return standingOf(db, action, senderClass);
}

// Compares against the action's own floor: injection and the requested action are per email,
// and a pin outlives emails.
function refuseBelowFloor(action: ActionName, level: Level): void {
  const least = floor([action], false);
  if (isBelow(level, least)) {
    throw new Refusal(
      `${action} is ${actionFor(action).riskClass} and never runs below ${least}; a pin can only raise it.`,
    );
  }
}

function standingOf(db: Db, action: ActionName, senderClass: SenderClass): BucketStanding {
  const pin = findPin(db, action, senderClass);
  const history = bucketHistory(db, action, senderClass);
  return { action, senderClass, pin, level: standingLevel(action, history, pin) };
}
