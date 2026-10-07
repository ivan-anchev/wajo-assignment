import { z } from "zod";
import type { ActionContext, ActionDefinition } from "./action-definition.ts";
import { ACTIONS, actionFor, type ActionName } from "./registry.ts";

export type Proposal = { action: ActionName; params: Record<string, unknown> };

const proposalOptions = ACTIONS.map((action) =>
  z.object({ action: z.literal(action.name), params: action.params }),
);
type ProposalOption = (typeof proposalOptions)[number];

// `ACTIONS.map` loses the non-empty tuple type that z.discriminatedUnion requires.
export const proposalSchema: z.ZodType<Proposal> = z.discriminatedUnion(
  "action",
  proposalOptions as [ProposalOption, ...ProposalOption[]],
);

export function executeProposal(proposal: Proposal, ctx: ActionContext): void {
  // Widening to ActionDefinition lets flat params through: execute is declared with method
  // syntax, which TS checks bivariantly. Params were already validated by proposalSchema.
  const action: ActionDefinition = actionFor(proposal.action);
  action.execute(proposal.params, ctx);
}
