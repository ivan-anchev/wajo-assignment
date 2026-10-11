import type { LanguageModel } from "ai";
import type { Store } from "../db/store.ts";
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

export function createAgent(store: Store, llm: LanguageModel) {
  return {
    async run(source: InboxSource): Promise<Transcript[]> {
      const transcripts: Transcript[] = [];
      for (const event of intake(store, source)) {
        transcripts.push(await processEvent(store, llm, event));
      }
      return transcripts;
    },

    transcript(emailId: string): Transcript | null {
      return store.findTranscript(emailId);
    },

    inbox(): Transcript[] {
      return store.openTranscripts();
    },

    log(limit: number): Transcript[] {
      return store.recentTranscripts(limit);
    },

    approve(itemId: number): ResponseResult {
      return respond.approve(store, itemId);
    },

    // Each extraction runs only on an item the response would accept, so no call is spent on a refusal.
    async edit(itemId: number, changes: ProposalEdit): Promise<ResponseResult> {
      const item = respond.itemAcceptingEdit(store, itemId, changes);
      const preferences = await preferencesAfterEdit(store, llm, item, changes);
      return respondAndNote(store, preferences, () => respond.edit(store, itemId, changes));
    },

    async reject(itemId: number, reason?: string): Promise<ResponseResult> {
      const preferences = reason
        ? await preferencesAfterReason(
            store,
            llm,
            respond.itemAccepting(store, itemId, "reject"),
            reason,
          )
        : null;
      return respondAndNote(store, preferences, () => respond.reject(store, itemId));
    },

    undo(itemId: number): ResponseResult {
      return respond.undo(store, itemId);
    },

    dismiss(itemId: number): ResponseResult {
      return respond.dismiss(store, itemId);
    },

    revert(decisionId: number): ResponseResult {
      return revert(store, decisionId);
    },

    pin(action: ActionName, senderClass: SenderClass, level: Level): BucketStanding {
      return pinning.pin(store, action, senderClass, level);
    },

    unpin(action: ActionName, senderClass: SenderClass): BucketStanding {
      return pinning.unpin(store, action, senderClass);
    },

    prefs(): string {
      return store.preferences.get();
    },
  };
}

export type Agent = ReturnType<typeof createAgent>;

function intake(store: Store, source: InboxSource): Event[] {
  const decided = store.emails.listIds();
  return readInbox(source)
    .filter((email) => !decided.has(email.id))
    .map((email) => ({ kind: "incoming_email", email }));
}

async function processEvent(store: Store, llm: LanguageModel, event: Event): Promise<Transcript> {
  const { email } = event;
  // Guard first: a suspected email never reaches the analysis prompt, so nothing it steered is stored.
  const injection = await checkInjection(llm, email);
  const analysis = injection.suspected ? null : await analyze(llm, email, store.preferences.get());
  // An unanalyzed email proposes no action, so it has no bucket to look up.
  const action = analysis?.proposal.action;
  const history = action ? store.feedback.listByBucket(action, email.senderClass) : [];
  const pin = action ? store.pins.find(action, email.senderClass) : null;
  return commit(store, email, {
    emailId: email.id,
    analysis,
    injection,
    pin,
    ...levelFor(analysis, injection, history, pin),
  });
}

function commit(
  store: Store,
  email: Email,
  decided: Omit<Decision, "id" | "createdAt">,
): Transcript {
  return store.transaction(() => {
    store.emails.insert(email);
    const decision = store.decisions.insert(decided);
    act(store, decision);
    return store.transcript(decision);
  });
}

// The LLM call has already run, so a failed extraction wrote nothing. The response and the
// updated preference list commit together.
function respondAndNote(
  store: Store,
  preferences: string[] | null,
  response: () => ResponseResult,
): ResponseResult {
  return store.transaction(() => {
    const result = response();
    const preference = preferences && notePreferences(store, preferences);
    return { ...result, preference };
  });
}
