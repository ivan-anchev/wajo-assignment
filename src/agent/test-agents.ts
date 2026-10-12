import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ActionName, Proposal, ProposalEdit } from "../domain/actions.ts";
import type { Transcript } from "../db/reads.ts";
import type { Store } from "../db/store.ts";
import { readInbox, writeInbox, type InboxSource } from "../inbox/inbox.ts";
import type { MockLanguageModelV4 } from "ai/test";
import { expect } from "vitest";
import { mockModel } from "../llm/test-models.ts";
import { readScenarios } from "../../eval/scenarios.ts";
import { App } from "../app/app.ts";

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

type AnalysisOptions = {
  requested?: ActionName;
  preferences?: string[] | Error;
};

export async function agentProposing(
  store: Store,
  proposal: Proposal,
  requested: ActionName = "none",
) {
  const app = new App({ store, model: modelProposing(proposal, { requested }) });
  await app.run(INBOX);
  return app;
}

export function newsletterInbox(
  store: Store,
): (proposal: Proposal, analysis?: AnalysisOptions) => Promise<Transcript> {
  const inboxDir = mkdtempSync(join(tmpdir(), "inbox-"));
  const newsletter = readInbox(INBOX).find((email) => email.id === "002")!;
  let delivered = 0;
  return async (proposal, analysis) => {
    const id = `n${++delivered}`;
    writeFileSync(join(inboxDir, `${id}.json`), JSON.stringify({ ...newsletter, id }));
    const [transcript] = await new App({ store, model: modelProposing(proposal, analysis) }).run({
      inboxDir,
      contactsPath: CONTACTS,
    });
    return transcript!;
  };
}

// A reversible action's first delivery runs and opens a notify item.
export async function notifiedExecution(
  deliver: ReturnType<typeof newsletterInbox>,
): Promise<Transcript> {
  const notified = await deliver(ARCHIVE);
  expect(notified).toMatchObject({
    decision: { level: "notify" },
    item: { kind: "notify", status: "open" },
    executions: [{ undoneAt: null }],
  });
  return notified;
}

export function feedbackCount(store: Store): number {
  return store.db.prepare<[], { n: number }>("SELECT count(*) AS n FROM feedback").get()!.n;
}

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
