import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Proposal } from "../domain/actions.ts";
import type { Transcript } from "../domain/types.ts";
import type { Db } from "../db/open-db.ts";
import { readInbox } from "../inbox/inbox.ts";
import { mockModel } from "../llm/test-models.ts";
import { createAgent } from "./agent.ts";

const CONTACTS = "fixtures/contacts.json";
export const INBOX = { inboxDir: "fixtures/inbox", contactsPath: CONTACTS };
export const INJECTION_INBOX = { inboxDir: "fixtures/injection", contactsPath: CONTACTS };

export const SEND_REPLY: Proposal = { action: "send_reply", params: { body: "Sounds good." } };
export const ARCHIVE: Proposal = { action: "archive", params: {} };
export const MARK_READ: Proposal = { action: "mark_read", params: {} };
export const NONE: Proposal = { action: "none", params: {} };
export const PAY_INVOICE: Proposal = {
  action: "pay_invoice",
  params: { amount: 120, currency: "EUR", payee: "Acme" },
};

export async function agentProposing(db: Db, proposal: Proposal) {
  const agent = agentAnalyzing(db, proposal, 0.9);
  await agent.run(INBOX);
  return agent;
}

export function newsletterInbox(
  db: Db,
): (proposal: Proposal, confidence?: number) => Promise<Transcript> {
  const inboxDir = mkdtempSync(join(tmpdir(), "inbox-"));
  const newsletter = readInbox(INBOX).find((email) => email.id === "002")!;
  let delivered = 0;
  return async (proposal, confidence = 0.9) => {
    const id = `n${++delivered}`;
    writeFileSync(join(inboxDir, `${id}.json`), JSON.stringify({ ...newsletter, id }));
    const [transcript] = await agentAnalyzing(db, proposal, confidence).run({
      inboxDir,
      contactsPath: CONTACTS,
    });
    return transcript!;
  };
}

export function feedbackCount(db: Db): number {
  return db.prepare<[], { n: number }>("SELECT count(*) AS n FROM feedback").get()!.n;
}

function agentAnalyzing(db: Db, proposal: Proposal, confidence: number) {
  return createAgent(
    db,
    mockModel({
      analysis: { summary: "s", intent: "reply", proposal, confidence },
      injection_verdict: { suspected: false, evidence: [] },
    }),
  );
}
