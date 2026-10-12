import type { MockLanguageModelV4 } from "ai/test";
import { readScenarios } from "../../eval/scenarios.ts";
import type { ActionName, Proposal, ProposalEdit } from "../domain/actions.ts";
import { readInbox, writeInbox, type InboxSource } from "../inbox/inbox.ts";
import { mockModel } from "../llm/test-models.ts";

const CONTACTS = "fixtures/contacts.json";
export const INBOX = { inboxDir: "fixtures/inbox", contactsPath: CONTACTS };
export const SCENARIO_INBOX = { inboxDir: "scenarios", contactsPath: CONTACTS };

export const SEND_REPLY: Proposal = { action: "send_reply", params: { body: "Sounds good." } };
export const ARCHIVE: Proposal = { action: "archive", params: {} };
export const MARK_READ: Proposal = { action: "mark_read", params: {} };
export const NONE: Proposal = { action: "none", params: {} };
export const LABEL: Proposal = { action: "label", params: { label: "finance" } };
export const PAY_INVOICE: Proposal = {
  action: "pay_invoice",
  params: { amount: 120, currency: "EUR", payee: "Acme" },
};
export const PAY_INVOICE_EDIT: ProposalEdit = {
  action: "pay_invoice",
  amount: 120,
  currency: "EUR",
  payee: "Acme",
};

export type AnalysisOptions = {
  requested?: ActionName;
  preferences?: string[] | Error;
};

export const SUMMARY = "A colleague asks whether the new meeting time works.";

export function modelProposing(
  proposal: Proposal,
  { requested = "none", preferences = [] }: AnalysisOptions = {},
): MockLanguageModelV4 {
  return mockModel({
    analysis: { summary: SUMMARY, intent: "reply", proposal, requested },
    injection_verdict: { suspected: false, evidence: [] },
    preferences: preferences instanceof Error ? preferences : { preferences },
  });
}

export function inboxOf(...ids: string[]): InboxSource {
  return writeInbox(
    readInbox(INBOX).filter(({ id }) => ids.includes(id)),
    CONTACTS,
  );
}

export function injectionInbox(): InboxSource {
  return writeInbox(
    readScenarios().filter(({ category }) => category === "injection"),
    CONTACTS,
  );
}

export function requestsNamed(llm: MockLanguageModelV4, name: string): string[] {
  return llm.doGenerateCalls
    .filter((call) => nameOf(call) === name)
    .map(({ prompt }) => JSON.stringify(prompt));
}

export function requestOrder(llm: MockLanguageModelV4): string[] {
  return llm.doGenerateCalls.map(nameOf);
}

function nameOf({ responseFormat }: MockLanguageModelV4["doGenerateCalls"][number]): string {
  return (responseFormat as { name: string }).name;
}
