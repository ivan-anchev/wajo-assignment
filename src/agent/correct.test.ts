import type { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it } from "vitest";
import { Store } from "../db/store.ts";
import { replayModel } from "../llm/test-models.ts";
import { Agent, Refusal } from "./agent.ts";
import {
  agentProposing,
  ARCHIVE,
  feedbackCount,
  injectionInbox,
  LABEL,
  modelProposing,
  newsletterInbox,
  NONE,
  requestsNamed,
  SEND_REPLY,
} from "./test-agents.ts";

const LABEL_NEWSLETTERS = "Newsletters from Northwind get the finance label.";
const LABEL_EDIT = { action: LABEL.action, ...LABEL.params };

let store: Store;
let deliver: ReturnType<typeof newsletterInbox>;
let llm: MockLanguageModelV4;
let agent: Agent;

beforeEach(() => {
  store = Store.open(":memory:");
  deliver = newsletterInbox(store);
  llm = modelProposing(ARCHIVE, { preferences: [LABEL_NEWSLETTERS] });
  agent = new Agent({ store, model: llm });
});

describe("correct", () => {
  it("undoes a silent execution, records undo feedback under its bucket and notes a preference", async () => {
    const silent = await silentArchive();

    const { transcript, promotion, preference } = await agent.correct(silent.decision.id, {
      action: "label",
      label: "finance",
    });

    expect(store.emails.getState(silent.email.id)).toMatchObject({ archivedAt: null, labels: [] });
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
    expect(preference).toBe(LABEL_NEWSLETTERS);
    expect(agent.prefs()).toBe(LABEL_NEWSLETTERS);
  });

  it("shows the extractor the change and the original proposal", async () => {
    const silent = await silentArchive();

    await agent.correct(silent.decision.id, { action: "label", label: "finance" });

    const [extraction] = requestsNamed(llm, "preferences");
    expect(extraction).toContain("proposed");
    expect(extraction).toMatch(/should have done .*finance.* instead; nothing was executed/);
  });

  it("steps the bucket back to notify", async () => {
    await agent.correct((await silentArchive()).decision.id, { action: "none" });

    expect((await deliver(ARCHIVE)).decision).toMatchObject({ learned: "notify", level: "notify" });
  });

  it("corrects once when corrected twice", async () => {
    const silent = await silentArchive();
    const corrected = (await agent.correct(silent.decision.id, { action: "none" })).transcript;
    const feedbackBefore = feedbackCount(store);

    await expect(agent.correct(silent.decision.id, { action: "none" })).rejects.toThrow(
      `Decision #${silent.decision.id} is already corrected.`,
    );
    expect(agent.transcript(silent.email.id)).toEqual(corrected);
    expect(feedbackCount(store)).toBe(feedbackBefore);
    expect(requestsNamed(llm, "preferences")).toHaveLength(1);
  });

  it("records undo feedback on the none bucket and corrects a silent none only once", async () => {
    const nothing = await deliver(NONE);
    expect(nothing.decision.level).toBe("silent");

    const { transcript, preference } = await agent.correct(nothing.decision.id, LABEL_EDIT);

    expect(transcript).toMatchObject({
      executions: [{ proposal: NONE, undoneAt: expect.any(String) }],
      feedback: { action: "none", senderClass: "newsletter", kind: "undo" },
    });
    expect(preference).toBe(LABEL_NEWSLETTERS);
    await expect(agent.correct(nothing.decision.id, LABEL_EDIT)).rejects.toThrow(
      `Decision #${nothing.decision.id} is already corrected.`,
    );
    expect(feedbackCount(store)).toBe(1);
    expect(requestsNamed(llm, "preferences")).toHaveLength(1);
  });
});

describe("correct refusals", () => {
  it("refuses a notified execution, naming the responses its item takes", async () => {
    for (let n = 0; n < 2; n++) {
      agent.approve((await deliver(ARCHIVE)).item!.id);
    }
    const notified = await deliver(ARCHIVE);
    const feedbackBefore = feedbackCount(store);

    await expect(agent.correct(notified.decision.id, LABEL_EDIT)).rejects.toThrow(
      `Decision #${notified.decision.id} has notify item #${notified.item!.id}; it takes dismiss, undo.`,
    );
    expect(agent.transcript(notified.email.id)).toEqual(notified);
    expect(store.emails.getState(notified.email.id).archivedAt).not.toBeNull();
    expect(feedbackCount(store)).toBe(feedbackBefore);
    expect(requestsNamed(llm, "preferences")).toHaveLength(0);
  });

  it("refuses an ask decision, naming the responses its item takes", async () => {
    const asked = await agentProposing(store, SEND_REPLY);

    await expect(asked.correct(1, LABEL_EDIT)).rejects.toThrow(
      "Decision #1 has ask item #1; it takes approve, edit, reject.",
    );
  });

  it("refuses every injection escalation without writing feedback", async () => {
    const guarded = new Agent({ store, model: replayModel() });
    const transcripts = await guarded.run(injectionInbox());

    for (const { decision } of transcripts) {
      await expect(guarded.correct(decision.id, LABEL_EDIT)).rejects.toThrow(
        /has escalate item #\d+; it takes dismiss\./,
      );
    }
    expect(feedbackCount(store)).toBe(0);
  });

  it("refuses an invalid edit and an unknown decision without calling the extractor", async () => {
    const silent = await silentArchive();

    await expect(agent.correct(silent.decision.id, { action: "label" })).rejects.toThrow(
      /Invalid edit/,
    );
    await expect(agent.correct(999, LABEL_EDIT)).rejects.toThrow(Refusal);
    await expect(agent.correct(999, LABEL_EDIT)).rejects.toThrow("There is no decision #999.");
    expect(store.emails.getState(silent.email.id).archivedAt).not.toBeNull();
    expect(requestsNamed(llm, "preferences")).toHaveLength(0);
  });
});

// Two approvals then two dismissals bring archive/newsletter to silent; the fifth archive
// executes with no item.
async function silentArchive() {
  for (const respond of [(id: number) => agent.approve(id), (id: number) => agent.dismiss(id)]) {
    for (let n = 0; n < 2; n++) {
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
