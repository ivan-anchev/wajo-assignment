import { z } from "zod";
import { actionFor, proposalSchema, undoProposal, type Proposal } from "../domain/actions.ts";
import { floor } from "../domain/policy.ts";
import type {
  Decision,
  Email,
  Item,
  ItemResponse,
  ItemStatus,
  ProposalEdit,
  ResponseResult,
} from "../domain/types.ts";
import { findExecutionByItem, getDecision, markUndone, transcriptOf } from "../db/decision-log.ts";
import { findItem, resolveItem } from "../db/items.ts";
import { getEmail } from "../db/mailbox.ts";
import type { Db } from "../db/open-db.ts";
import { execute } from "./act.ts";
import { learn } from "./learn.ts";
import { Refusal } from "./refusal.ts";

type ResponseContext = {
  db: Db;
  item: Item;
  decision: Decision;
  email: Email;
  response: ItemResponse;
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
    revert(r);
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
    const r = { db, item, decision, email: getEmail(db, decision.emailId), response };
    takeEffect(r);
    const promotion = learnFrom(r);
    return { transcript: transcriptOf(db, decision), promotion };
  })();
}

// Refusing a closed item up front keeps its error ahead of any edit or floor error;
// `claim` stays the at-most-once guarantee.
function itemAccepting(db: Db, itemId: number, response: ItemResponse): Item {
  const item = findItem(db, itemId);
  if (!item) {
    throw new Refusal(`There is no item #${itemId}.`);
  }
  if (item.status !== "open") {
    throw alreadyResolved(item);
  }
  if (!item.allowedResponses.includes(response)) {
    throw new Refusal(
      `${item.kind} item #${itemId} takes ${item.allowedResponses.join(", ")}, not ${response}.`,
    );
  }
  return item;
}

function approveProposal(r: ResponseContext, proposal: Proposal): void {
  const required = floor(actionFor(proposal.action).riskClass, r.decision.injection.suspected);
  if (required === "escalate") {
    throw new Refusal(`${proposal.action} must be escalated; nothing was executed.`);
  }
  resolve(r, "approved", proposal);
  execute(r.db, r.decision, proposal, r.item.id);
}

function resolve(
  r: ResponseContext,
  status: Exclude<ItemStatus, "open">,
  proposal: Proposal = r.item.proposal,
): void {
  claim(r, resolveItem(r.db, r.item.id, { status, proposal }));
}

function learnFrom({ db, item, decision, email, response }: ResponseContext): string | null {
  if (item.kind === "escalate") {
    return null;
  }
  return learn(db, {
    itemId: item.id,
    action: decision.analysis.proposal.action,
    senderClass: email.senderClass,
    kind: response,
  });
}

function revert({ db, item, decision }: ResponseContext): void {
  const execution = findExecutionByItem(db, item.id);
  const now = new Date().toISOString();
  undoProposal(execution.proposal, { db, emailId: decision.emailId, now });
  markUndone(db, execution.id, now);
}

function claim(r: ResponseContext, stillOpen: boolean): void {
  if (!stillOpen) {
    throw alreadyResolved(r.item);
  }
}

function alreadyResolved(item: Item): Refusal {
  return new Refusal(`Item #${item.id} is already ${item.status}.`);
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
