import type { LanguageModel } from "ai";
import {
  findTranscript,
  insertDecision,
  openTranscripts,
  transcriptOf,
} from "../db/decision-log.ts";
import { bucketHistory } from "../db/feedback.ts";
import { insertEmail, storedEmailIds } from "../db/mailbox.ts";
import type { Db } from "../db/open-db.ts";
import { findPin } from "../db/pins.ts";
import { appendPreference, readPreferences } from "../db/preferences.ts";
import { readInbox, type InboxSource } from "../inbox/inbox.ts";
import { levelFor } from "../domain/policy.ts";
import { act } from "./act.ts";
import { analyze } from "./analyze.ts";
import { checkInjection } from "./check-injection.ts";
import { preferenceFromEdit, preferenceFromReason } from "./extract-preference.ts";
import * as pinning from "./pin.ts";
import * as respond from "./respond.ts";
import type { ActionName } from "../domain/actions.ts";
import type {
  BucketStanding,
  Decision,
  Email,
  Event,
  Level,
  ProposalEdit,
  ResponseResult,
  SenderClass,
  Transcript,
} from "../domain/types.ts";

export { Refusal } from "./refusal.ts";

export function createAgent(db: Db, llm: LanguageModel) {
  return {
    async run(source: InboxSource): Promise<Transcript[]> {
      const transcripts: Transcript[] = [];
      for (const event of intake(db, source)) {
        transcripts.push(await processEvent(db, llm, event));
      }
      return transcripts;
    },

    transcript(emailId: string): Transcript | null {
      return findTranscript(db, emailId);
    },

    inbox(): Transcript[] {
      return openTranscripts(db);
    },

    approve(itemId: number): ResponseResult {
      return respond.approve(db, itemId);
    },

    async edit(itemId: number, changes: ProposalEdit): Promise<ResponseResult> {
      const preference = await preferenceFromEdit(db, llm, itemId, changes);
      return respondAndNote(db, preference, () => respond.edit(db, itemId, changes));
    },

    async reject(itemId: number, reason?: string): Promise<ResponseResult> {
      const preference = reason ? await preferenceFromReason(db, llm, itemId, reason) : null;
      return respondAndNote(db, preference, () => respond.reject(db, itemId));
    },

    undo(itemId: number): ResponseResult {
      return respond.undo(db, itemId);
    },

    dismiss(itemId: number): ResponseResult {
      return respond.dismiss(db, itemId);
    },

    pin(action: ActionName, senderClass: SenderClass, level: Level): BucketStanding {
      return pinning.pin(db, action, senderClass, level);
    },

    unpin(action: ActionName, senderClass: SenderClass): BucketStanding {
      return pinning.unpin(db, action, senderClass);
    },

    prefs(): string {
      return readPreferences(db);
    },
  };
}

export type Agent = ReturnType<typeof createAgent>;

function intake(db: Db, source: InboxSource): Event[] {
  const decided = storedEmailIds(db);
  return readInbox(source)
    .filter((email) => !decided.has(email.id))
    .map((email) => ({ kind: "incoming_email", email }));
}

async function processEvent(db: Db, llm: LanguageModel, event: Event): Promise<Transcript> {
  const { email } = event;
  const [analysis, injection] = await Promise.all([
    analyze(llm, email, readPreferences(db)),
    checkInjection(llm, email),
  ]);
  const { action } = analysis.proposal;
  const history = bucketHistory(db, action, email.senderClass);
  const pin = findPin(db, action, email.senderClass);
  return commit(db, email, {
    emailId: email.id,
    analysis,
    injection,
    pin,
    ...levelFor(analysis, injection, history, pin),
  });
}

function commit(db: Db, email: Email, decided: Omit<Decision, "id" | "createdAt">): Transcript {
  return db.transaction(() => {
    insertEmail(db, email);
    const decision = insertDecision(db, decided);
    act(db, decision);
    return transcriptOf(db, decision);
  })();
}

// The LLM call has already run, so a failed extraction wrote nothing. The response and its
// preference line commit together.
function respondAndNote(
  db: Db,
  preference: string | null,
  response: () => ResponseResult,
): ResponseResult {
  return db.transaction(() => {
    const result = response();
    if (preference) {
      appendPreference(db, preference);
    }
    return { ...result, preference };
  })();
}
