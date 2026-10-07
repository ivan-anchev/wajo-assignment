import { readInbox, type InboxSource } from "../mail/index.ts";
import { storedEmailIds, type Db } from "../store/index.ts";
import type { Event } from "./records.model.ts";

// Intake does not store emails; processEvent stores each one together with its
// decision. An id in `emails` therefore means "decided", and an email whose
// analysis failed is simply picked up again on the next run.
export function intake(db: Db, source: InboxSource): Event[] {
  const decided = storedEmailIds(db);
  return readInbox(source)
    .filter((email) => !decided.has(email.id))
    .map((email) => ({ kind: "incoming_email", email }));
}
