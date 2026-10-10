import type { LanguageModel } from "ai";
import {
  findTranscript,
  insertDecision,
  openTranscripts,
  recentTranscripts,
  transcriptOf,
} from "../db/decision-log.ts";
import { bucketHistory } from "../db/feedback.ts";
import { insertEmail, storedEmailIds } from "../db/mailbox.ts";
import type { Db } from "../db/open-db.ts";
import { findPin } from "../db/pins.ts";
import { readPreferences } from "../db/preferences.ts";
import { readInbox, type InboxSource } from "../inbox/inbox.ts";
import { levelFor } from "../domain/policy.ts";
import { act } from "./act.ts";
import { analyze } from "./analyze.ts";
import { checkInjection } from "./check-injection.ts";
import { preferencesAfterEdit, preferencesAfterReason } from "./extract-preference.ts";
import { notePreferences } from "./note-preferences.ts";
import * as pinning from "./pin.ts";
import * as respond from "./respond.ts";
import { revert } from "./revert.ts";
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

    log(limit: number): Transcript[] {
      return recentTranscripts(db, limit);
    },

    approve(itemId: number): ResponseResult {
      return respond.approve(db, itemId);
    },

    async edit(itemId: number, changes: ProposalEdit): Promise<ResponseResult> {
      const preferences = await preferencesAfterEdit(db, llm, itemId, changes);
      return respondAndNote(db, preferences, () => respond.edit(db, itemId, changes));
    },

    async reject(itemId: number, reason?: string): Promise<ResponseResult> {
      const preferences = reason ? await preferencesAfterReason(db, llm, itemId, reason) : null;
      return respondAndNote(db, preferences, () => respond.reject(db, itemId));
    },

    undo(itemId: number): ResponseResult {
      return respond.undo(db, itemId);
    },

    dismiss(itemId: number): ResponseResult {
      return respond.dismiss(db, itemId);
    },

    revert(decisionId: number): ResponseResult {
      return revert(db, decisionId);
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
  // Guard first: a suspected email never reaches the analysis prompt, so nothing it steered is stored.
  const injection = await checkInjection(llm, email);
  const analysis = injection.suspected ? null : await analyze(llm, email, readPreferences(db));
  // An unanalyzed email proposes no action, so it has no bucket to look up.
  const action = analysis?.proposal.action;
  const history = action ? bucketHistory(db, action, email.senderClass) : [];
  const pin = action ? findPin(db, action, email.senderClass) : null;
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

// The LLM call has already run, so a failed extraction wrote nothing. The response and the
// updated preference list commit together.
function respondAndNote(
  db: Db,
  preferences: string[] | null,
  response: () => ResponseResult,
): ResponseResult {
  return db.transaction(() => {
    const result = response();
    const preference = preferences && notePreferences(db, preferences);
    return { ...result, preference };
  })();
}
