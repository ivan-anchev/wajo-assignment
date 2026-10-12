import type { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it } from "vitest";
import { Store } from "../db/store.ts";
import type { Proposal } from "../domain/actions.ts";
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
  notifiedExecution,
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
  it("undoes a silent execution, records redirect feedback under its bucket and notes a preference", async () => {
    const silent = await silentExecution();

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
        kind: "redirect",
      },
    });
    expect(promotion).toBeNull();
    expect(preference).toBe(LABEL_NEWSLETTERS);
    expect(agent.prefs()).toBe(LABEL_NEWSLETTERS);
  });

  it("shows the extractor the change and the original proposal", async () => {
    const silent = await silentExecution();

    await agent.correct(silent.decision.id, { action: "label", label: "finance" });

    const [extraction] = requestsNamed(llm, "preferences");
    expect(extraction).toContain("proposed");
    expect(extraction).toMatch(
      /should have done .*finance.* instead of what ran, which was undone/,
    );
  });

  it("leaves the bucket where it was when the action changes", async () => {
    await agent.correct((await silentExecution()).decision.id, { action: "none" });

    expect((await deliver(ARCHIVE)).decision).toMatchObject({ learned: "silent", level: "silent" });
  });

  it("demotes the bucket when only the params change", async () => {
    const silent = await silentExecution(LABEL);

    const { transcript } = await agent.correct(silent.decision.id, { label: "reading" });

    expect(transcript.feedback).toMatchObject({ action: "label", kind: "edit" });
    expect((await deliver(LABEL)).decision).toMatchObject({ learned: "notify", level: "notify" });
  });

  it("corrects once when corrected twice", async () => {
    const silent = await silentExecution();
    const corrected = (await agent.correct(silent.decision.id, { action: "none" })).transcript;
    const feedbackBefore = feedbackCount(store);

    await expect(agent.correct(silent.decision.id, { action: "none" })).rejects.toThrow(
      `Decision #${silent.decision.id} is already corrected.`,
    );
    expect(agent.transcript(silent.email.id)).toEqual(corrected);
    expect(feedbackCount(store)).toBe(feedbackBefore);
    expect(requestsNamed(llm, "preferences")).toHaveLength(1);
  });

  it("records redirect feedback on the none bucket and corrects a silent none only once", async () => {
    const nothing = await deliver(NONE);
    expect(nothing.decision.level).toBe("silent");

    const { transcript, preference } = await agent.correct(nothing.decision.id, LABEL_EDIT);

    expect(transcript).toMatchObject({
      executions: [{ proposal: NONE, undoneAt: expect.any(String) }],
      feedback: { action: "none", senderClass: "newsletter", kind: "redirect" },
    });
    expect(preference).toBe(LABEL_NEWSLETTERS);
    await expect(agent.correct(nothing.decision.id, LABEL_EDIT)).rejects.toThrow(
      `Decision #${nothing.decision.id} is already corrected.`,
    );
    expect(feedbackCount(store)).toBe(1);
    expect(requestsNamed(llm, "preferences")).toHaveLength(1);
  });

  it("corrects a notified execution: closes its item as undone, undoes it, records redirect and notes a preference", async () => {
    const notified = await notifiedExecution(agent, deliver);

    const { transcript, preference } = await agent.correct(notified.decision.id, LABEL_EDIT);

    expect(transcript).toMatchObject({
      item: { id: notified.item!.id, status: "undone" },
      executions: [{ proposal: ARCHIVE, undoneAt: expect.any(String) }],
      feedback: { action: "archive", senderClass: "newsletter", kind: "redirect" },
    });
    expect(store.emails.getState(notified.email.id).archivedAt).toBeNull();
    expect(preference).toBe(LABEL_NEWSLETTERS);
    expect(requestsNamed(llm, "preferences")).toHaveLength(1);
  });
});

describe("correct refusals", () => {
  it("refuses a notified decision whose item is already dismissed", async () => {
    const notified = await notifiedExecution(agent, deliver);
    agent.dismiss(notified.item!.id);
    const feedbackBefore = feedbackCount(store);

    await expect(agent.correct(notified.decision.id, LABEL_EDIT)).rejects.toThrow(
      `Decision #${notified.decision.id} has notify item #${notified.item!.id}, already dismissed.`,
    );
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
    const silent = await silentExecution();

    await expect(agent.correct(silent.decision.id, { action: "label" })).rejects.toThrow(
      /Invalid edit/,
    );
    await expect(agent.correct(999, LABEL_EDIT)).rejects.toThrow(Refusal);
    await expect(agent.correct(999, LABEL_EDIT)).rejects.toThrow("There is no decision #999.");
    expect(store.emails.getState(silent.email.id).archivedAt).not.toBeNull();
    expect(requestsNamed(llm, "preferences")).toHaveLength(0);
  });
});

// Two approvals then two dismissals bring the proposal's newsletter bucket to silent; the fifth
// delivery executes with no item.
async function silentExecution(proposal: Proposal = ARCHIVE) {
  for (const respond of [(id: number) => agent.approve(id), (id: number) => agent.dismiss(id)]) {
    for (let n = 0; n < 2; n++) {
      respond((await deliver(proposal)).item!.id);
    }
  }
  const silent = await deliver(proposal);
  expect(silent).toMatchObject({
    decision: { level: "silent" },
    item: null,
    executions: [{ proposal, undoneAt: null }],
  });
  return silent;
}
