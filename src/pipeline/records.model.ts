import type { Proposal } from "../actions/index.ts";
import type { Email } from "../mail/index.ts";
import type { ItemKind, ItemResponse, Level } from "../policy/index.ts";

// A union with one member: a second event kind turns `const { email } = event`
// in processEvent into a compile error, which is where the dispatch then belongs.
export type Event = { kind: "incoming_email"; email: Email };

export type Analysis = { summary: string; intent: string; proposal: Proposal; confidence: number };

export type InjectionVerdict = { suspected: boolean; evidence: string[] };

export type Decision = {
  id: number;
  emailId: string;
  analysis: Analysis;
  injection: InjectionVerdict;
  floor: Level;
  level: Level;
  createdAt: string;
};

export type ItemStatus = "open" | "approved" | "rejected" | "dismissed" | "undone";

export type Item = {
  id: number;
  decisionId: number;
  kind: ItemKind;
  status: ItemStatus;
  // Own copy: `edit` rewrites it without touching the decision.
  proposal: Proposal;
  createdAt: string;
  resolvedAt: string | null;
  allowedResponses: readonly ItemResponse[];
};

export type Execution = {
  id: number;
  decisionId: number;
  itemId: number | null;
  proposal: Proposal;
  executedAt: string;
  undoneAt: string | null;
};

export type Transcript = {
  email: Email;
  decision: Decision;
  item: Item | null;
  executions: Execution[];
};
