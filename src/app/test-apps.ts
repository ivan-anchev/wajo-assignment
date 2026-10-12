import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "vitest";
import { ARCHIVE, INBOX, modelProposing, type AnalysisOptions } from "../agent/test-agents.ts";
import type { Transcript } from "../db/reads.ts";
import type { Store } from "../db/store.ts";
import type { ActionName, Proposal } from "../domain/actions.ts";
import { readInbox } from "../inbox/inbox.ts";
import { App } from "./app.ts";

export async function agentProposing(
  store: Store,
  proposal: Proposal,
  requested: ActionName = "none",
) {
  const app = new App({ store, model: modelProposing(proposal, { requested }) });
  await app.intake.run(INBOX);
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
    const [transcript] = await new App({
      store,
      model: modelProposing(proposal, analysis),
    }).intake.run({
      inboxDir,
      contactsPath: INBOX.contactsPath,
    });
    return transcript!;
  };
}

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
