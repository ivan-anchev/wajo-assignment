import { z } from "zod";
import type { Db } from "../db/open-db.ts";
import { deleteDraft, readEmailState, saveDraft, updateEmailState } from "../db/mailbox.ts";

export type RiskClass = "reversible" | "external" | "irreversible" | "money";

export type ActionContext = { db: Db; emailId: string; now: string };

type ActionCommon<N extends string, S extends z.ZodObject> = {
  name: N;
  description: string;
  params: S;
  // Executes nothing, so policy never learns or brakes it.
  inert?: true;
  // Sync because effects run inside a better-sqlite3 transaction, which rejects async callbacks.
  execute(params: z.infer<S>, ctx: ActionContext): void;
};

type ReversibleAction<N extends string, S extends z.ZodObject> = ActionCommon<N, S> & {
  riskClass: "reversible";
  undo(params: z.infer<S>, ctx: ActionContext): void;
};

type OneWayAction<N extends string, S extends z.ZodObject> = ActionCommon<N, S> & {
  riskClass: Exclude<RiskClass, "reversible">;
};

type ActionDefinition<N extends string = string, S extends z.ZodObject = z.ZodObject> =
  | ReversibleAction<N, S>
  | OneWayAction<N, S>;

function defineAction<const N extends string, S extends z.ZodObject>(
  definition: ReversibleAction<N, S>,
): ReversibleAction<N, S>;
function defineAction<const N extends string, S extends z.ZodObject>(
  definition: OneWayAction<N, S>,
): OneWayAction<N, S>;
function defineAction(definition: ActionDefinition): ActionDefinition {
  return definition;
}

const noParams = z.strictObject({});
const noEffect = () => {};

// Simulator: reversible actions change local email state; the rest never leave the process.
export const ACTIONS = [
  defineAction({
    name: "none",
    description: "Take no action on the email",
    riskClass: "reversible",
    inert: true,
    params: noParams,
    execute: noEffect,
    undo: noEffect,
  }),
  defineAction({
    name: "archive",
    description: "Move the email out of the inbox; it stays searchable",
    riskClass: "reversible",
    params: noParams,
    execute: (_, { db, emailId, now }) => updateEmailState(db, emailId, { archivedAt: now }),
    undo: (_, { db, emailId }) => updateEmailState(db, emailId, { archivedAt: null }),
  }),
  defineAction({
    name: "mark_read",
    description: "Mark the email as read and leave it in the inbox",
    riskClass: "reversible",
    params: noParams,
    execute: (_, { db, emailId, now }) => updateEmailState(db, emailId, { readAt: now }),
    undo: (_, { db, emailId }) => updateEmailState(db, emailId, { readAt: null }),
  }),
  defineAction({
    name: "snooze",
    description: "Hide the email until the given time, then return it to the inbox",
    riskClass: "reversible",
    params: z.strictObject({ until: z.iso.datetime() }),
    execute: ({ until }, { db, emailId }) => updateEmailState(db, emailId, { snoozedUntil: until }),
    undo: (_, { db, emailId }) => updateEmailState(db, emailId, { snoozedUntil: null }),
  }),
  defineAction({
    name: "label",
    description: "Tag the email with a label for filing and search",
    riskClass: "reversible",
    params: z.strictObject({ label: z.string() }),
    execute: ({ label }, { db, emailId }) =>
      updateEmailState(db, emailId, { labels: [...readEmailState(db, emailId).labels, label] }),
    undo: ({ label }, { db, emailId }) =>
      updateEmailState(db, emailId, {
        labels: readEmailState(db, emailId).labels.filter((existing) => existing !== label),
      }),
  }),
  defineAction({
    name: "draft_reply",
    description: "Save a reply for the user to review; it is never sent",
    riskClass: "reversible",
    params: z.strictObject({ body: z.string() }),
    execute: ({ body }, { db, emailId }) => saveDraft(db, emailId, body),
    undo: (_, { db, emailId }) => deleteDraft(db, emailId),
  }),
  defineAction({
    name: "send_reply",
    description: "Send a reply now; prefer draft_reply unless a standing preference asks to send",
    riskClass: "external",
    params: z.strictObject({ body: z.string() }),
    execute: noEffect,
  }),
  defineAction({
    name: "forward",
    description: "Forward the email to another address",
    riskClass: "external",
    params: z.strictObject({ to: z.email() }),
    execute: noEffect,
  }),
  defineAction({
    name: "unsubscribe",
    description: "Unsubscribe the user from this mailing list",
    riskClass: "external",
    params: noParams,
    execute: noEffect,
  }),
  defineAction({
    name: "delete_permanently",
    description: "Delete the email for good; it cannot be recovered",
    riskClass: "irreversible",
    params: noParams,
    execute: noEffect,
  }),
  defineAction({
    name: "pay_invoice",
    description: "Pay the invoice amount to the payee",
    riskClass: "money",
    params: z.strictObject({
      amount: z.number().positive(),
      currency: z.string(),
      payee: z.string(),
    }),
    execute: noEffect,
  }),
] as const;

type RegisteredAction = (typeof ACTIONS)[number];
export type ActionName = RegisteredAction["name"];

export const actionNameSchema = z.enum(ACTIONS.map(({ name }) => name));

export type Proposal = { action: ActionName; params: Record<string, unknown> };

const proposalOptions = ACTIONS.map((action) =>
  z.object({ action: z.literal(action.name).describe(action.description), params: action.params }),
);
type ProposalOption = (typeof proposalOptions)[number];

// `ACTIONS.map` loses the non-empty tuple type that z.discriminatedUnion requires.
export const proposalSchema: z.ZodType<Proposal> = z.discriminatedUnion(
  "action",
  proposalOptions as [ProposalOption, ...ProposalOption[]],
);

export function actionFor<N extends ActionName>(name: N): Extract<RegisteredAction, { name: N }> {
  return ACTIONS.find((action) => action.name === name) as Extract<RegisteredAction, { name: N }>;
}

export function executeProposal(proposal: Proposal, ctx: ActionContext): void {
  // Widening to ActionDefinition lets flat params through: execute is declared with method
  // syntax, which TS checks bivariantly. Params were already validated by proposalSchema.
  const action: ActionDefinition = actionFor(proposal.action);
  action.execute(proposal.params, ctx);
}

// Only notified and silent executions are undone, both below the ask floor, so the throw is the
// narrowing.
export function undoProposal(proposal: Proposal, ctx: ActionContext): void {
  const action: ActionDefinition = actionFor(proposal.action);
  if (action.riskClass !== "reversible") {
    throw new Error(`${proposal.action} is ${action.riskClass} and cannot be undone`);
  }
  action.undo(proposal.params, ctx);
}
