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
import { Agent, type Event, type Learned, type Teaching } from "../agent/agent.ts";
import { Learner, type BucketStanding } from "../agent/learner.ts";
import { PreferenceMemory } from "../agent/preferences.ts";
import { execute, refuseIfFloorEscalates, undoExecution } from "./execution.ts";
import { Refusal } from "./refusal.ts";

export type ResponseResult = Learned & { transcript: Transcript };

type OpenItem = Transcript & { item: Item };

export class App {
  private readonly store: Store;
  private readonly agent: Agent;
  private readonly learner: Learner;

  constructor({ store, model }: { store: Store; model: LanguageModel }) {
    const learner = new Learner({ feedback: store.feedback, pins: store.pins });

    this.store = store;
    this.learner = learner;
    this.agent = new Agent({ model, learner, memory: new PreferenceMemory(store.preferences) });
  }

  async run(source: InboxSource): Promise<Transcript[]> {
    const transcripts: Transcript[] = [];

    for (const event of this.intake(source)) {
      const decided = await this.agent.decide(event);
      transcripts.push(this.recordAndAct(event.email, decided));
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
    return this.respond(itemId, "approve", (asked) => this.approveItem(asked, asked.item.proposal));
  }

  async edit(itemId: number, changes: ProposalEdit): Promise<ResponseResult> {
    const asked = this.openItemAccepting(itemId, "edit");
    const edited = proposalAfterEdit(asked.item.proposal, changes);
    refuseIfFloorEscalates(asked.decision, edited);
    const preferences = await this.agent.reflect(asked, { kind: "edit", changes });

    return this.respond(itemId, "edit", (current) => this.approveItem(current, edited), {
      feedback: editFeedback(asked.item.proposal, edited),
      preferences,
    });
  }

  async reject(itemId: number, reason?: string): Promise<ResponseResult> {
    const preferences = reason
      ? await this.agent.reflect(this.openItemAccepting(itemId, "reject"), {
          kind: "reject",
          reason,
        })
      : null;

    return this.respond(itemId, "reject", ({ item }) => this.closeItem(item, "rejected"), {
      feedback: "reject",
      preferences,
    });
  }

  undo(itemId: number): ResponseResult {
    return this.respond(itemId, "undo", (notified) => this.undoWhatRan(notified));
  }

  dismiss(itemId: number): ResponseResult {
    return this.respond(itemId, "dismiss", ({ item }) => this.closeItem(item, "dismissed"));
  }

  // A decision that ran without asking, silently or with a notification, is corrected after the
  // fact: the correction undoes what ran and teaches, but never executes the corrected proposal.
  // Like an edit at ask, changing the action is a redirect that says nothing about the level the
  // proposed action deserves.
  async correct(decisionId: number, changes: ProposalEdit): Promise<ResponseResult> {
    const ran = this.uncorrectedDecision(decisionId);
    const proposed = proposalOf(ran.decision.analysis);
    const corrected = proposalAfterEdit(proposed, changes);
    const preferences = await this.agent.reflect(ran, { kind: "correct", changes });

    return this.answer(
      () => this.uncorrectedDecision(decisionId),
      (current) => this.undoWhatRan(current),
      { feedback: editFeedback(proposed, corrected), preferences },
    );
  }

  pin(action: ActionName, senderClass: SenderClass, level: Level): BucketStanding {
    refusePinBelowFloor(action, level);

    return this.learner.pinBucket(action, senderClass, level);
  }

  unpin(action: ActionName, senderClass: SenderClass): BucketStanding {
    return this.learner.unpinBucket(action, senderClass);
  }

  prefs(): string {
    return this.store.reads.preferences();
  }

  private intake(source: InboxSource): Event[] {
    const decided = this.store.emails.listIds();

    return readInbox(source)
      .filter((email) => !decided.has(email.id))
      .map((email) => ({ kind: "incoming_email", email }));
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

  private respond(
    itemId: number,
    response: ItemResponse,
    takeEffect: (opened: OpenItem) => void,
    teaching: Teaching = { feedback: response, preferences: null },
  ): ResponseResult {
    return this.answer(() => this.openItemAccepting(itemId, response), takeEffect, teaching);
  }

  private answer<Answered extends Transcript>(
    open: () => Answered,
    takeEffect: (answered: Answered) => void,
    teaching: Teaching,
  ): ResponseResult {
    return this.store.transaction(() => {
      const answered = open();

      takeEffect(answered);

      const learned = this.agent.learn(answered, teaching);

      return { transcript: this.store.reads.transcript(answered.decision), ...learned };
    });
  }

  private openItemAccepting(itemId: number, response: ItemResponse): OpenItem {
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

    return { ...this.store.reads.transcript(this.store.decisions.get(item.decisionId)), item };
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

  private approveItem({ item, decision }: OpenItem, proposal: Proposal): void {
    this.closeItem(item, "approved", proposal);

    execute(this.store, decision, proposal, item.id);
  }

  private undoWhatRan({ decision, item, executions }: Transcript): void {
    if (item) {
      this.closeItem(item, "undone");
    }

    undoExecution(this.store, decision, executions[0]!);
  }

  private closeItem(
    item: Item,
    status: Exclude<ItemStatus, "open">,
    proposal: Proposal = item.proposal,
  ): void {
    this.store.items.update(item.id, { status, proposal });
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
