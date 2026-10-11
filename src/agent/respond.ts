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
import { findExecutionByItem, getDecision, transcriptOf } from "../db/decision-log.ts";
import { findItem, resolveItem } from "../db/items.ts";
import { getEmail } from "../db/mailbox.ts";
import type { Db } from "../db/open-db.ts";
import { execute, undoExecution } from "./act.ts";
import { learn } from "./learn.ts";
import { Refusal } from "./refusal.ts";

type ResponseContext = {
  db: Db;
  item: Item;
  decision: Decision;
};

export function approve(db: Db, itemId: number): ResponseResult {
  return respond(db, itemId, "approve", (r) => approveProposal(r, r.item.proposal));
}

export function edit(db: Db, itemId: number, changes: ProposalEdit): ResponseResult {
  return respond(db, itemId, "edit", (r) => approveProposal(r, editedProposal(r.item, changes)));
}

export function reject(db: Db, itemId: number): ResponseResult {
  return respond(db, itemId, "reject", (r) => resolve(r, "rejected"));
}

export function dismiss(db: Db, itemId: number): ResponseResult {
  return respond(db, itemId, "dismiss", (r) => resolve(r, "dismissed"));
}

export function undo(db: Db, itemId: number): ResponseResult {
  return respond(db, itemId, "undo", (r) => {
    resolve(r, "undone");
    undoExecution(r.db, r.decision, findExecutionByItem(r.db, r.item.id));
  });
}

// One transaction: a refusal throws and rolls everything back.
function respond(
  db: Db,
  itemId: number,
  response: ItemResponse,
  takeEffect: (r: ResponseContext) => void,
): ResponseResult {
  return db.transaction(() => {
    const item = itemAccepting(db, itemId, response);
    const decision = getDecision(db, item.decisionId);
    
    takeEffect({ db, item, decision });
    
    const { senderClass } = getEmail(db, decision.emailId);
    const promotion = item.kind === "escalate" ? null : learn(db, decision, senderClass, response);
    
    return { transcript: transcriptOf(db, decision), promotion, preference: null };
  })();
}

export function itemAccepting(db: Db, itemId: number, response: ItemResponse): Item {
  const item = findItem(db, itemId);
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
export function itemAcceptingEdit(db: Db, itemId: number, changes: ProposalEdit): Item {
  const item = itemAccepting(db, itemId, "edit");
  refuseEscalated(getDecision(db, item.decisionId), editedProposal(item, changes));
  return item;
}

function approveProposal(r: ResponseContext, proposal: Proposal): void {
  refuseEscalated(r.decision, proposal);
  resolve(r, "approved", proposal);
  execute(r.db, r.decision, proposal, r.item.id);
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
  resolveItem(r.db, r.item.id, { status, proposal });
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
