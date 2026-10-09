import { beforeEach, describe, expect, it } from "vitest";
import type { Proposal } from "../domain/actions.ts";
import { openDb, type Db } from "../db/open-db.ts";
import { mockModel, replayModel } from "../llm/test-models.ts";
import { createAgent, InvalidResponseError } from "./agent.ts";

const CONTACTS = "fixtures/contacts.json";
const INBOX = { inboxDir: "fixtures/inbox", contactsPath: CONTACTS };
const INJECTION_INBOX = { inboxDir: "fixtures/injection", contactsPath: CONTACTS };

const SEND_REPLY: Proposal = { action: "send_reply", params: { body: "Sounds good." } };

let db: Db;

beforeEach(() => {
  db = openDb(":memory:");
});

// Opens ask items #1..#3 for emails 001..003; 001 is from an internal sender.
async function agentAsking(proposal: Proposal) {
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

function feedbackCount(): number {
  return db.prepare<[], { n: number }>("SELECT count(*) AS n FROM feedback").get()!.n;
}

describe("inbox", () => {
  it("lists every open ask with the responses its kind allows, oldest first", async () => {
    const agent = await agentAsking(SEND_REPLY);

    const inbox = agent.inbox();

    expect(inbox.map((t) => t.email.id)).toEqual(["001", "002", "003"]);
    expect(inbox.map((t) => t.item)).toMatchObject(
      [1, 2, 3].map((id) => ({
        id,
        kind: "ask",
        status: "open",
        allowedResponses: ["approve", "edit", "reject"],
      })),
    );
  });

  it("lists escalations with dismiss as the only response", async () => {
    const agent = createAgent(db, replayModel());
    await agent.run(INJECTION_INBOX);

    expect(
      agent.inbox().map((t) => ({
        kind: t.item?.kind,
        allowedResponses: t.item?.allowedResponses,
        suspected: t.decision.injection.suspected,
      })),
    ).toEqual(
      Array.from({ length: 6 }, () => ({
        kind: "escalate",
        allowedResponses: ["dismiss"],
        suspected: true,
      })),
    );
  });

  it("drops an item once it is resolved", async () => {
    const agent = await agentAsking(SEND_REPLY);

    agent.approve(1);

    expect(agent.inbox().map((t) => t.item!.id)).toEqual([2, 3]);
  });

  it("is empty when every decision was silent", async () => {
    const agent = createAgent(db, replayModel());
    await agent.run(INBOX);

    expect(agent.inbox()).toEqual([]);
  });
});

describe("approve", () => {
  it("executes the proposal once, closes the item, records positive feedback", async () => {
    const agent = await agentAsking(SEND_REPLY);

    const transcript = agent.approve(1);

    expect(transcript.item).toMatchObject({ status: "approved", resolvedAt: expect.any(String) });
    expect(transcript.executions).toMatchObject([{ itemId: 1, proposal: SEND_REPLY }]);
    expect(transcript.feedback).toMatchObject({
      itemId: 1,
      action: "send_reply",
      senderClass: "internal",
      kind: "approve",
    });
  });

  it("executes once when approved twice", async () => {
    const agent = await agentAsking(SEND_REPLY);
    agent.approve(1);

    expect(() => agent.approve(1)).toThrow(InvalidResponseError);
    expect(() => agent.approve(1)).toThrow(/already approved/);
    expect(() => agent.edit(1, { bdy: "Thanks!" })).toThrow(/already approved/);
    expect(() =>
      agent.edit(1, { action: "pay_invoice", amount: 120, currency: "EUR", payee: "Acme" }),
    ).toThrow(/already approved/);
    expect(agent.transcript("001")!.executions).toHaveLength(1);
    expect(feedbackCount()).toBe(1);
  });

  it("refuses an unknown item id", async () => {
    const agent = await agentAsking(SEND_REPLY);

    expect(() => agent.approve(999)).toThrow(/There is no item #999/);
  });
});

describe("edit", () => {
  it("executes the edited payload under the original bucket", async () => {
    const agent = await agentAsking(SEND_REPLY);
    const edited = { action: "send_reply", params: { body: "Thanks!" } };

    const transcript = agent.edit(1, { body: "Thanks!" });

    expect(transcript.item!.proposal).toEqual(edited);
    expect(transcript.executions[0]!.proposal).toEqual(edited);
    expect(transcript.decision.analysis.proposal).toEqual(SEND_REPLY);
    expect(transcript.feedback).toMatchObject({ action: "send_reply", kind: "edit" });
  });

  it("overlays a same-action edit on the current params", async () => {
    const agent = await agentAsking(SEND_REPLY);

    expect(agent.edit(1, {}).executions[0]!.proposal).toEqual(SEND_REPLY);
  });

  it("buckets an action switch under the proposed action", async () => {
    const agent = await agentAsking(SEND_REPLY);

    const transcript = agent.edit(1, { action: "forward", to: "dana@northwind.io" });

    expect(transcript.executions[0]!.proposal).toEqual({
      action: "forward",
      params: { to: "dana@northwind.io" },
    });
    expect(transcript.feedback!.action).toBe("send_reply");
  });

  it("re-runs the floor and refuses an edit into a money action (invariant 5)", async () => {
    const agent = await agentAsking(SEND_REPLY);
    const before = agent.transcript("001");

    expect(() =>
      agent.edit(1, { action: "pay_invoice", amount: 120, currency: "EUR", payee: "Acme" }),
    ).toThrow(/pay_invoice must be escalated/);
    expect(agent.transcript("001")).toEqual(before);
    expect(before!.item).toMatchObject({ status: "open", proposal: SEND_REPLY });
    expect(before!.executions).toEqual([]);
    expect(feedbackCount()).toBe(0);
  });

  it.each([
    ["an unknown action", { action: "teleport" }],
    ["a missing param after a switch", { action: "forward" }],
    ["an ill-typed param", { action: "forward", to: "not-an-email" }],
    ["an unknown key", { bdy: "Thanks!" }],
  ])("refuses %s and leaves the item untouched", async (_, changes) => {
    const agent = await agentAsking(SEND_REPLY);
    const before = agent.transcript("001");

    expect(() => agent.edit(1, changes)).toThrow(/Invalid edit for item #1/);
    expect(agent.transcript("001")).toEqual(before);
    expect(feedbackCount()).toBe(0);
  });
});

describe("run", () => {
  it("never writes feedback, whatever it decides", async () => {
    const agent = createAgent(db, replayModel());
    await agent.run(INBOX);
    await agent.run(INJECTION_INBOX);

    expect(feedbackCount()).toBe(0);
  });
});
