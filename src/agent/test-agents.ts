import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ActionName, Proposal } from "../domain/actions.ts";
import type { ProposalEdit, Transcript } from "../domain/types.ts";
import type { Db } from "../db/open-db.ts";
import { readInbox, writeInbox, type InboxSource } from "../inbox/inbox.ts";
import type { MockLanguageModelV4 } from "ai/test";
import { mockModel } from "../llm/test-models.ts";
import { readScenarios } from "../scenarios/scenarios.ts";
import { createAgent } from "./agent.ts";

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
  confidence?: number;
  requested?: ActionName;
  preference?: string | null | Error;
};

export async function agentProposing(db: Db, proposal: Proposal, requested: ActionName = "none") {
  const agent = createAgent(db, modelProposing(proposal, { requested }));
  await agent.run(INBOX);
  return agent;
}

export function newsletterInbox(
  db: Db,
): (proposal: Proposal, analysis?: AnalysisOptions) => Promise<Transcript> {
  const inboxDir = mkdtempSync(join(tmpdir(), "inbox-"));
  const newsletter = readInbox(INBOX).find((email) => email.id === "002")!;
  let delivered = 0;
  return async (proposal, analysis) => {
    const id = `n${++delivered}`;
    writeFileSync(join(inboxDir, `${id}.json`), JSON.stringify({ ...newsletter, id }));
    const [transcript] = await createAgent(db, modelProposing(proposal, analysis)).run({
      inboxDir,
      contactsPath: CONTACTS,
    });
    return transcript!;
  };
}

export function feedbackCount(db: Db): number {
  return db.prepare<[], { n: number }>("SELECT count(*) AS n FROM feedback").get()!.n;
}

export function modelProposing(
  proposal: Proposal,
  { confidence = 0.9, requested = "none", preference = null }: AnalysisOptions = {},
): MockLanguageModelV4 {
  return mockModel({
    analysis: { summary: "s", intent: "reply", proposal, requested, confidence },
    injection_verdict: { suspected: false, evidence: [] },
    preference: preference instanceof Error ? preference : { sentence: preference },
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
    .filter(({ responseFormat }) => (responseFormat as { name: string }).name === name)
    .map(({ prompt }) => JSON.stringify(prompt));
}
