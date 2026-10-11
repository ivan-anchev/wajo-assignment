import { beforeEach, describe, expect, it } from "vitest";
import { Store } from "../db/store.ts";
import { replayModel } from "../llm/test-models.ts";
import { Agent, Refusal } from "./agent.ts";
import {
  agentProposing,
  ARCHIVE,
  feedbackCount,
  injectionInbox,
  newsletterInbox,
  SEND_REPLY,
} from "./test-agents.ts";

let store: Store;
let deliver: ReturnType<typeof newsletterInbox>;
let agent: Agent;

beforeEach(() => {
  store = Store.open(":memory:");
  deliver = newsletterInbox(store);
  agent = new Agent({ store, model: replayModel() });
});

describe("revert", () => {
  it("reverts a silent execution and records undo feedback under its bucket", async () => {
    const silent = await silentArchive();

    const { transcript, promotion } = agent.revert(silent.decision.id);

    expect(store.emails.getState(silent.email.id).archivedAt).toBeNull();
    expect(transcript).toMatchObject({
      item: null,
      executions: [{ proposal: ARCHIVE, undoneAt: expect.any(String) }],
      feedback: {
        decisionId: silent.decision.id,
        action: "archive",
        senderClass: "newsletter",
        kind: "undo",
      },
    });
    expect(promotion).toBeNull();
  });

  it("steps the bucket back to notify", async () => {
    agent.revert((await silentArchive()).decision.id);

    expect((await deliver(ARCHIVE)).decision).toMatchObject({ learned: "notify", level: "notify" });
  });

  it("reverts once when reverted twice", async () => {
    const silent = await silentArchive();
    const reverted = agent.revert(silent.decision.id).transcript;
    const feedbackBefore = feedbackCount(store);

    expect(() => agent.revert(silent.decision.id)).toThrow(
      `Decision #${silent.decision.id} is already undone.`,
    );
    expect(agent.transcript(silent.email.id)).toEqual(reverted);
    expect(feedbackCount(store)).toBe(feedbackBefore);
  });
});

describe("revert refusals", () => {
  it("refuses a notified execution, naming the responses its item takes", async () => {
    for (let n = 0; n < 3; n++) {
      agent.approve((await deliver(ARCHIVE)).item!.id);
    }
    const notified = await deliver(ARCHIVE);
    const feedbackBefore = feedbackCount(store);

    expect(() => agent.revert(notified.decision.id)).toThrow(
      `Decision #${notified.decision.id} has notify item #${notified.item!.id}; it takes dismiss, undo.`,
    );
    expect(agent.transcript(notified.email.id)).toEqual(notified);
    expect(notified.executions).toMatchObject([{ undoneAt: null }]);
    expect(store.emails.getState(notified.email.id).archivedAt).not.toBeNull();
    expect(feedbackCount(store)).toBe(feedbackBefore);
  });

  it("refuses an ask decision, naming the responses its item takes", async () => {
    const asked = await agentProposing(store, SEND_REPLY);

    expect(() => asked.revert(1)).toThrow(
      "Decision #1 has ask item #1; it takes approve, edit, reject.",
    );
  });

  it("refuses every injection escalation without writing feedback", async () => {
    const transcripts = await agent.run(injectionInbox());

    for (const { decision } of transcripts) {
      expect(() => agent.revert(decision.id)).toThrow(/has escalate item #\d+; it takes dismiss\./);
    }
    expect(feedbackCount(store)).toBe(0);
  });

  it("refuses a silent decision that executed no action, and an unknown decision", async () => {
    const nothing = await deliver({ action: "none", params: {} });

    expect(nothing.decision.level).toBe("silent");
    expect(() => agent.revert(nothing.decision.id)).toThrow(
      `Decision #${nothing.decision.id} executed nothing to revert.`,
    );
    expect(() => agent.revert(999)).toThrow(Refusal);
    expect(() => agent.revert(999)).toThrow("There is no decision #999.");
    expect(feedbackCount(store)).toBe(0);
  });
});

// Three approvals then three dismissals bring archive/newsletter to silent; the seventh archive
// executes with no item.
async function silentArchive() {
  for (const respond of [(id: number) => agent.approve(id), (id: number) => agent.dismiss(id)]) {
    for (let n = 0; n < 3; n++) {
      respond((await deliver(ARCHIVE)).item!.id);
    }
  }
  const silent = await deliver(ARCHIVE);
  expect(silent).toMatchObject({
    decision: { level: "silent" },
    item: null,
    executions: [{ undoneAt: null }],
  });
  expect(store.emails.getState(silent.email.id).archivedAt).not.toBeNull();
  return silent;
}
