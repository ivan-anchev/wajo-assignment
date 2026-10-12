import { z } from "zod";
import type { Agent, Learned, Teaching } from "../agent/agent.ts";
import type { Item, ItemStatus } from "../db/items.ts";
import type { Transcript } from "../db/reads.ts";
import type { Store } from "../db/store.ts";
import { proposalSchema, type Proposal, type ProposalEdit } from "../domain/actions.ts";
import { proposalOf, type FeedbackKind, type ItemResponse } from "../domain/policy.ts";
import { execute, refuseIfFloorEscalates, undoExecution } from "./execution.ts";
import { Refusal } from "./refusal.ts";

export type ResponseResult = Learned & { transcript: Transcript };

type OpenItem = Transcript & { item: Item };

export class Responses {
  private readonly store: Store;
  private readonly agent: Agent;

  constructor(parts: { store: Store; agent: Agent }) {
    this.store = parts.store;
    this.agent = parts.agent;
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
