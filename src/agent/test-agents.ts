import type { Proposal } from "../domain/actions.ts";
import type { Db } from "../db/open-db.ts";
import { mockModel } from "../llm/test-models.ts";
import { createAgent } from "./agent.ts";

const CONTACTS = "fixtures/contacts.json";
export const INBOX = { inboxDir: "fixtures/inbox", contactsPath: CONTACTS };
export const INJECTION_INBOX = { inboxDir: "fixtures/injection", contactsPath: CONTACTS };

export const SEND_REPLY: Proposal = { action: "send_reply", params: { body: "Sounds good." } };
export const PAY_INVOICE: Proposal = {
  action: "pay_invoice",
  params: { amount: 120, currency: "EUR", payee: "Acme" },
};

// Proposes `proposal` for every demo email 001..003, in order (001 is from an internal sender):
// a reply opens ask items #1..#3 and a payment opens escalations #1..#3, one per email.
export async function agentProposing(db: Db, proposal: Proposal) {
  const agent = createAgent(
    db,
    mockModel({
      analysis: { summary: "s", intent: "reply", proposal, confidence: 0.9 },
      injection_verdict: { suspected: false, evidence: [] },
    }),
  );
  await agent.run(INBOX);
  return agent;
}

export function feedbackCount(db: Db): number {
  return db.prepare<[], { n: number }>("SELECT count(*) AS n FROM feedback").get()!.n;
}
