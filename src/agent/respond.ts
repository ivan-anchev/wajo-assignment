import { z } from "zod";
import { proposalSchema, type Proposal } from "../domain/actions.ts";
import { floor, requestOf } from "../domain/policy.ts";
import type {
  Decision,
  Item,
  ItemResponse,
  ItemStatus,
  ProposalEdit,
  ResponseResult,
} from "../domain/types.ts";
import type { Store } from "../db/store.ts";
import { execute, undoExecution } from "./act.ts";
import { learn } from "./learn.ts";

// The one failure a caller is expected to handle. Anything else thrown here is a bug.
export class Refusal extends Error {}

type ResponseContext = {
  store: Store;
  item: Item;
  decision: Decision;
};

export function approve(store: Store, itemId: number): ResponseResult {
  return respond(store, itemId, "approve", (r) => approveProposal(r, r.item.proposal));
}

export function edit(store: Store, itemId: number, changes: ProposalEdit): ResponseResult {
  return respond(store, itemId, "edit", (r) => approveProposal(r, editedProposal(r.item, changes)));
}

export function reject(store: Store, itemId: number): ResponseResult {
  return respond(store, itemId, "reject", (r) => resolve(r, "rejected"));
}

export function dismiss(store: Store, itemId: number): ResponseResult {
  return respond(store, itemId, "dismiss", (r) => resolve(r, "dismissed"));
}

export function undo(store: Store, itemId: number): ResponseResult {
  return respond(store, itemId, "undo", (r) => {
    resolve(r, "undone");
    undoExecution(r.store, r.decision, r.store.executions.findByItem(r.item.id));
  });
}

// One transaction: a refusal throws and rolls everything back.
function respond(
  store: Store,
  itemId: number,
  response: ItemResponse,
  takeEffect: (r: ResponseContext) => void,
): ResponseResult {
  return store.transaction(() => {
    const item = itemAccepting(store, itemId, response);
    const decision = store.decisions.get(item.decisionId);

    takeEffect({ store, item, decision });

    const { senderClass } = store.emails.get(decision.emailId);
    const promotion =
      item.kind === "escalate" ? null : learn(store, decision, senderClass, response);

    return { transcript: store.transcript(decision), promotion, preference: null };
  });
}

export function itemAccepting(store: Store, itemId: number, response: ItemResponse): Item {
  const item = store.items.find(itemId);
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
export function itemAcceptingEdit(store: Store, itemId: number, changes: ProposalEdit): Item {
  const item = itemAccepting(store, itemId, "edit");
  refuseEscalated(store.decisions.get(item.decisionId), editedProposal(item, changes));
  return item;
}

function approveProposal(r: ResponseContext, proposal: Proposal): void {
  refuseEscalated(r.decision, proposal);
  resolve(r, "approved", proposal);
  execute(r.store, r.decision, proposal, r.item.id);
}

function refuseEscalated({ analysis, injection }: Decision, proposal: Proposal): void {
  if (floor([proposal.action, requestOf(analysis)], injection.suspected) === "escalate") {
    throw new Refusal(`${proposal.action} must be escalated; nothing was executed.`);
  }
}

function resolve(
  r: ResponseContext,
  status: Exclude<ItemStatus, "open">,
  proposal: Proposal = r.item.proposal,
): void {
  r.store.items.update(r.item.id, { status, proposal });
}

function editedProposal(item: Item, changes: ProposalEdit): Proposal {
  const { action = item.proposal.action, ...params } = changes;
  const base = action === item.proposal.action ? item.proposal.params : {};
  const parsed = proposalSchema.safeParse({ action, params: { ...base, ...params } });

  if (!parsed.success) {
    throw new Refusal(`Invalid edit for item #${item.id}: ${z.prettifyError(parsed.error)}`);
  }

  return parsed.data;
}
