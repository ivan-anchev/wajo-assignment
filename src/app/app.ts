import type { LanguageModel } from "ai";
import { z } from "zod";
import {
  actionFor,
  proposalSchema,
  type ActionName,
  type Proposal,
  type ProposalEdit,
} from "../domain/actions.ts";
import {
  floor,
  isBelow,
  levelFor,
  proposalOf,
  type FeedbackKind,
  type ItemResponse,
  type Level,
} from "../domain/policy.ts";
import type { Decision, NewDecision } from "../db/decisions.ts";
import type { Item, ItemStatus } from "../db/items.ts";
import type { Transcript } from "../db/reads.ts";
import type { Store } from "../db/store.ts";
import { readInbox, type Email, type InboxSource, type SenderClass } from "../inbox/inbox.ts";
import { analyze } from "../agent/analyze.ts";
import { checkInjection } from "../agent/check-injection.ts";
import { checkPayment } from "../agent/check-payment.ts";
import { Learner, type BucketStanding } from "../agent/learner.ts";
import { extractPreferences, PreferenceMemory } from "../agent/preferences.ts";
import { execute, refuseIfFloorEscalates, undoExecution } from "./execution.ts";
import { Refusal } from "./refusal.ts";

export type ResponseResult = {
  transcript: Transcript;
  promotion: Level | null;
  preference: string | null;
};

// A union with one member: a second event kind turns `const { email } = event`
// in decide into a compile error, which is where the dispatch then belongs.
type Event = { kind: "incoming_email"; email: Email };

export class App {
  private readonly store: Store;
  private readonly model: LanguageModel;
  private readonly learner: Learner;
  private readonly memory: PreferenceMemory;

  constructor(config: { store: Store; model: LanguageModel }) {
    this.store = config.store;
    this.model = config.model;
    this.learner = new Learner(config.store);
    this.memory = new PreferenceMemory(config.store.preferences);
  }

  async run(source: InboxSource): Promise<Transcript[]> {
    const transcripts: Transcript[] = [];

    for (const event of this.intake(source)) {
      transcripts.push(await this.decide(event));
    }

    return transcripts;
  }

  transcript(emailId: string): Transcript | null {
    return this.store.reads.findTranscript(emailId);
  }

  inbox(): Transcript[] {
    return this.store.reads.openTranscripts();
  }

  log(limit: number): Transcript[] {
    return this.store.reads.recentTranscripts(limit);
  }

  approve(itemId: number): ResponseResult {
    return this.respondToItem(itemId, "approve", (item, decision) =>
      this.executeApprovedProposal(item, decision, item.proposal),
    );
  }

  async edit(itemId: number, changes: ProposalEdit): Promise<ResponseResult> {
    const item = this.openItemAcceptingEdit(itemId, changes);
    const edited = proposalAfterEdit(item.proposal, changes);
    const preferences = await extractPreferences(
      this.model,
      this.transcriptOf(item),
      { kind: "edit", changes },
      this.memory.text(),
    );

    return this.respondAndNotePreferences(preferences, () =>
      this.respondToItem(
        itemId,
        "edit",
        (current, decision) => this.executeApprovedProposal(current, decision, edited),
        editFeedback(item.proposal, edited),
      ),
    );
  }

  async reject(itemId: number, reason?: string): Promise<ResponseResult> {
    const preferences = reason
      ? await extractPreferences(
          this.model,
          this.transcriptOf(this.openItemAccepting(itemId, "reject")),
          { kind: "reject", reason },
          this.memory.text(),
        )
      : null;

    return this.respondAndNotePreferences(preferences, () =>
      this.respondToItem(itemId, "reject", (item) => this.closeItem(item, "rejected")),
    );
  }

  undo(itemId: number): ResponseResult {
    return this.respondToItem(itemId, "undo", (item, decision) => {
      this.closeItem(item, "undone");

      undoExecution(this.store, decision, this.store.executions.findByItem(item.id));
    });
  }

  dismiss(itemId: number): ResponseResult {
    return this.respondToItem(itemId, "dismiss", (item) => this.closeItem(item, "dismissed"));
  }

  // A decision that ran without asking, silently or with a notification, is corrected after the
  // fact: the correction undoes what ran and teaches, but never executes the corrected proposal.
  // Like an edit at ask, changing the action is a redirect that says nothing about the level the
  // proposed action deserves.
  async correct(decisionId: number, changes: ProposalEdit): Promise<ResponseResult> {
    const transcript = this.uncorrectedDecision(decisionId);
    const corrected = proposalAfterEdit(proposalOf(transcript.decision.analysis), changes);
    const preferences = await extractPreferences(
      this.model,
      transcript,
      { kind: "correct", changes },
      this.memory.text(),
    );

    return this.respondAndNotePreferences(preferences, () => {
      const promotion = this.undoCorrected(transcript, corrected);
      return {
        transcript: this.store.reads.transcript(transcript.decision),
        promotion,
        preference: null,
      };
    });
  }

  pin(action: ActionName, senderClass: SenderClass, level: Level): BucketStanding {
    refusePinBelowFloor(action, level);

    return this.learner.pinBucket(action, senderClass, level);
  }

  unpin(action: ActionName, senderClass: SenderClass): BucketStanding {
    return this.learner.unpinBucket(action, senderClass);
  }

  prefs(): string {
    return this.memory.text();
  }

  private intake(source: InboxSource): Event[] {
    const decided = this.store.emails.listIds();

    return readInbox(source)
      .filter((email) => !decided.has(email.id))
      .map((email) => ({ kind: "incoming_email", email }));
  }

  private async decide(event: Event): Promise<Transcript> {
    const { email } = event;
    // Guard first: a suspected email never reaches the analysis prompt, so nothing it steered is stored.
    const injection = await checkInjection(this.model, email);
    const payment = checkPayment(email);
    const analysis = injection.suspected
      ? null
      : await analyze(this.model, email, this.memory.text());
    // An unanalyzed email proposes no action, so it has no bucket to look up.
    const action = analysis?.proposal.action;
    const { history, pin } = action
      ? this.learner.bucket(action, email.senderClass)
      : { history: [], pin: null };

    return this.recordAndAct(email, {
      emailId: email.id,
      analysis,
      injection,
      payment,
      pin,
      ...levelFor(analysis, [injection, payment], history, pin),
    });
  }

  private recordAndAct(email: Email, decided: NewDecision): Transcript {
    return this.store.transaction(() => {
      this.store.emails.insert(email);
      const decision = this.store.decisions.insert(decided);
      this.actOn(decision);
      return this.store.reads.transcript(decision);
    });
  }

  private actOn(decision: Decision): void {
    const proposal = proposalOf(decision.analysis);
    const item =
      decision.level === "silent"
        ? null
        : this.store.items.insert({ decisionId: decision.id, kind: decision.level, proposal });

    if (decision.level === "silent" || decision.level === "notify") {
      execute(this.store, decision, proposal, item?.id ?? null);
    }
  }

  // The LLM call has already run, so a failed extraction wrote nothing. The response and the
  // updated preference list commit together.
  private respondAndNotePreferences(
    preferences: string[] | null,
    response: () => ResponseResult,
  ): ResponseResult {
    return this.store.transaction(() => {
      const result = response();
      const preference = preferences && this.memory.note(preferences);
      return { ...result, preference };
    });
  }

  private respondToItem(
    itemId: number,
    response: ItemResponse,
    takeEffect: (item: Item, decision: Decision) => void,
    feedback: FeedbackKind = response,
  ): ResponseResult {
    return this.store.transaction(() => {
      const item = this.openItemAccepting(itemId, response);
      const decision = this.store.decisions.get(item.decisionId);

      takeEffect(item, decision);

      const { senderClass } = this.store.emails.get(decision.emailId);
      const promotion =
        item.kind === "escalate"
          ? null
          : this.learner.recordResponse(decision, senderClass, feedback);

      return { transcript: this.store.reads.transcript(decision), promotion, preference: null };
    });
  }

  private openItemAccepting(itemId: number, response: ItemResponse): Item {
    const item = this.store.items.find(itemId);

    if (!item) {
      throw new Refusal(`There is no item #${itemId}.`);
    }

    if (item.status !== "open") {
      throw new Refusal(`Item #${itemId} is already ${item.status}.`);
    }

    if (!item.allowedResponses.includes(response)) {
      throw new Refusal(
        `${item.kind} item #${itemId} takes ${item.allowedResponses.join(", ")}, not ${response}.`,
      );
    }

    return item;
  }

  // Every refusal `edit` can raise, checked without writing anything.
  private openItemAcceptingEdit(itemId: number, changes: ProposalEdit): Item {
    const item = this.openItemAccepting(itemId, "edit");

    refuseIfFloorEscalates(
      this.store.decisions.get(item.decisionId),
      proposalAfterEdit(item.proposal, changes),
    );

    return item;
  }

  private transcriptOf(item: Item): Transcript {
    return this.store.reads.transcript(this.store.decisions.get(item.decisionId));
  }

  private executeApprovedProposal(item: Item, decision: Decision, proposal: Proposal): void {
    this.closeItem(item, "approved", proposal);

    execute(this.store, decision, proposal, item.id);
  }

  private closeItem(
    item: Item,
    status: Exclude<ItemStatus, "open">,
    proposal: Proposal = item.proposal,
  ): void {
    this.store.items.update(item.id, { status, proposal });
  }

  // Every refusal `correct` can raise, checked without writing anything.
  private uncorrectedDecision(decisionId: number): Transcript {
    const decision = this.store.decisions.find(decisionId);
    if (!decision) {
      throw new Refusal(`There is no decision #${decisionId}.`);
    }

    const transcript = this.store.reads.transcript(decision);
    const { item } = transcript;
    if (item && item.kind !== "notify") {
      const { id, kind, allowedResponses } = item;
      throw new Refusal(
        `Decision #${decisionId} has ${kind} item #${id}; it takes ${allowedResponses.join(", ")}.`,
      );
    }

    if (item && item.status !== "open") {
      throw new Refusal(
        `Decision #${decisionId} has notify item #${item.id}, already ${item.status}.`,
      );
    }

    if (transcript.feedback) {
      throw new Refusal(`Decision #${decisionId} is already corrected.`);
    }

    return transcript;
  }

  private undoCorrected(
    { decision, email, item, executions }: Transcript,
    corrected: Proposal,
  ): Level | null {
    if (item) {
      this.closeItem(item, "undone");
    }

    undoExecution(this.store, decision, executions[0]!);

    return this.learner.recordResponse(
      decision,
      email.senderClass,
      editFeedback(proposalOf(decision.analysis), corrected),
    );
  }
}

function proposalAfterEdit(proposal: Proposal, changes: ProposalEdit): Proposal {
  const { action = proposal.action, ...params } = changes;
  const base = action === proposal.action ? proposal.params : {};
  const parsed = proposalSchema.safeParse({ action, params: { ...base, ...params } });

  if (!parsed.success) {
    throw new Refusal(`Invalid edit: ${z.prettifyError(parsed.error)}`);
  }

  return parsed.data;
}

function editFeedback(proposed: Proposal, edited: Proposal): FeedbackKind {
  return edited.action === proposed.action ? "edit" : "redirect";
}

function refusePinBelowFloor(action: ActionName, level: Level): void {
  const least = floor([action], []);

  if (isBelow(level, least)) {
    throw new Refusal(
      `${action} is ${actionFor(action).riskClass} and never runs below ${least}; a pin can only raise it.`,
    );
  }
}
