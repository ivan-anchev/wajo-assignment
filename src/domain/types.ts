import type { ActionName, Proposal } from "./actions.ts";
import type { EmailFile } from "../inbox/inbox.ts";

export type SenderClass = "internal" | "known" | "newsletter" | "first_contact";

export type Email = EmailFile & { senderClass: SenderClass };

export type EmailState = {
  archivedAt: string | null;
  readAt: string | null;
  snoozedUntil: string | null;
  labels: string[];
};

// A union with one member: a second event kind turns `const { email } = event`
// in processEvent into a compile error, which is where the dispatch then belongs.
export type Event = { kind: "incoming_email"; email: Email };

export const LEVELS = ["silent", "notify", "ask", "escalate"] as const;
export type Level = (typeof LEVELS)[number];
export type LearnedLevel = Exclude<Level, "escalate">;

export type ItemKind = Exclude<Level, "silent">;
export type ItemStatus = "open" | "approved" | "rejected" | "dismissed" | "undone";
export type ItemResponse = "approve" | "edit" | "reject" | "dismiss" | "undo";

export type Analysis = { summary: string; intent: string; proposal: Proposal; confidence: number };

export type InjectionVerdict = { suspected: boolean; evidence: string[] };

export type Decision = {
  id: number;
  emailId: string;
  analysis: Analysis;
  injection: InjectionVerdict;
  floor: Level;
  learned: LearnedLevel;
  brake: boolean;
  level: Level;
  createdAt: string;
};

export type Item = {
  id: number;
  decisionId: number;
  kind: ItemKind;
  status: ItemStatus;
  // Own copy: `edit` rewrites it without touching the decision.
  proposal: Proposal;
  createdAt: string;
  resolvedAt: string | null;
  // Derived from `kind` when read, never stored. `status` says whether it is still open.
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

// (action, senderClass) is the learner's bucket; `action` is the originally proposed action.
export type Feedback = {
  id: number;
  itemId: number;
  action: ActionName;
  senderClass: SenderClass;
  kind: ItemResponse;
  createdAt: string;
};

// The key `action` switches the action.
export type ProposalEdit = Record<string, unknown>;

export type Transcript = {
  email: Email;
  decision: Decision;
  item: Item | null;
  executions: Execution[];
  feedback: Feedback | null;
};
