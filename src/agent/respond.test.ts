import { beforeEach, describe, expect, it } from "vitest";
import { Store } from "../db/store.ts";
import { replayModel } from "../llm/test-models.ts";
import { App } from "../app/app.ts";
import { Refusal } from "../app/refusal.ts";
import {
  agentProposing,
  ARCHIVE,
  feedbackCount,
  injectionInbox,
  MARK_READ,
  modelProposing,
  newsletterInbox,
  notifiedExecution,
  PAY_INVOICE,
  PAY_INVOICE_EDIT,
  SEND_REPLY,
} from "./test-agents.ts";

let store: Store;

beforeEach(() => {
  store = Store.open(":memory:");
});

describe("approve", () => {
  it("executes the proposal once, closes the item, records positive feedback", async () => {
    const app = await agentProposing(store, SEND_REPLY);

    const { transcript } = app.responses.approve(1);

    expect(transcript.item).toMatchObject({ status: "approved", resolvedAt: expect.any(String) });
    expect(transcript.executions).toMatchObject([{ itemId: 1, proposal: SEND_REPLY }]);
    expect(transcript.feedback).toMatchObject({
      decisionId: 1,
      action: "send_reply",
      senderClass: "internal",
      kind: "approve",
    });
  });

  it("executes once when approved twice", async () => {
    const app = await agentProposing(store, SEND_REPLY);
    app.responses.approve(1);

    expect(() => app.responses.approve(1)).toThrow(Refusal);
    expect(() => app.responses.approve(1)).toThrow(/already approved/);
    await expect(app.responses.edit(1, { bdy: "Thanks!" })).rejects.toThrow(/already approved/);
    await expect(app.responses.edit(1, PAY_INVOICE_EDIT)).rejects.toThrow(/already approved/);
    expect(app.reads.findTranscript("001")!.executions).toHaveLength(1);
    expect(feedbackCount(store)).toBe(1);
  });

  it("is refused after reject and executes nothing", async () => {
    const app = await agentProposing(store, SEND_REPLY);
    await app.responses.reject(1);

    expect(() => app.responses.approve(1)).toThrow(/already rejected/);
    expect(app.reads.findTranscript("001")!.executions).toEqual([]);
    expect(app.reads.findTranscript("001")!.feedback!.kind).toBe("reject");
  });
});

describe("edit", () => {
  it("executes the edited payload under the original bucket", async () => {
    const app = await agentProposing(store, SEND_REPLY);
    const edited = { action: "send_reply", params: { body: "Thanks!" } };

    const { transcript } = await app.responses.edit(1, { body: "Thanks!" });

    expect(transcript.item!.proposal).toEqual(edited);
    expect(transcript.executions[0]!.proposal).toEqual(edited);
    expect(transcript.decision.analysis?.proposal).toEqual(SEND_REPLY);
    expect(transcript.feedback).toMatchObject({ action: "send_reply", kind: "edit" });
  });

  it("overlays a same-action edit on the current params", async () => {
    const app = await agentProposing(store, SEND_REPLY);

    expect((await app.responses.edit(1, {})).transcript.executions[0]!.proposal).toEqual(
      SEND_REPLY,
    );
  });

  it("buckets an action switch under the proposed action", async () => {
    const app = await agentProposing(store, SEND_REPLY);

    const { transcript } = await app.responses.edit(1, {
      action: "forward",
      to: "dana@northwind.io",
    });

    expect(transcript.executions[0]!.proposal).toEqual({
      action: "forward",
      params: { to: "dana@northwind.io" },
    });
    expect(transcript.feedback!.action).toBe("send_reply");
  });

  it("re-runs the floor, refuses an edit into a money action and leaves the ask usable (invariant 5)", async () => {
    const app = await agentProposing(store, SEND_REPLY);
    const before = app.reads.findTranscript("001");

    await expect(app.responses.edit(1, PAY_INVOICE_EDIT)).rejects.toThrow(
      /pay_invoice must be escalated/,
    );
    expect(app.reads.findTranscript("001")).toEqual(before);
    expect(before!.item).toMatchObject({ status: "open", proposal: SEND_REPLY });
    expect(before!.executions).toEqual([]);
    expect(feedbackCount(store)).toBe(0);

    expect((await app.responses.reject(1)).transcript.feedback).toMatchObject({ kind: "reject" });
  });

  it("asks on a promoted bucket when the email requests an ask-floor action, executing only on approval or edit", async () => {
    const deliver = newsletterInbox(store);
    const app = new App({ store, model: modelProposing(ARCHIVE) });
    for (let n = 0; n < 2; n++) {
      app.responses.dismiss((await deliver(ARCHIVE)).item!.id);
    }
    const asked = await deliver(ARCHIVE, { requested: "forward" });
    const another = await deliver(ARCHIVE, { requested: "forward" });

    expect(asked).toMatchObject({ decision: { floor: "ask", level: "ask" }, executions: [] });
    expect(app.responses.approve(asked.item!.id).transcript.executions).toMatchObject([
      { proposal: ARCHIVE },
    ]);
    expect(
      (await app.responses.edit(another.item!.id, { action: "mark_read" })).transcript,
    ).toMatchObject({
      item: { kind: "ask", status: "approved" },
      executions: [{ proposal: MARK_READ }],
    });
  });

  it.each([
    ["an unknown action", { action: "teleport" }],
    ["a missing param after a switch", { action: "forward" }],
    ["an ill-typed param", { action: "forward", to: "not-an-email" }],
    ["an unknown key", { bdy: "Thanks!" }],
  ])("refuses %s and leaves the item untouched", async (_, changes) => {
    const app = await agentProposing(store, SEND_REPLY);
    const before = app.reads.findTranscript("001");

    await expect(app.responses.edit(1, changes)).rejects.toThrow(/Invalid edit/);
    expect(app.reads.findTranscript("001")).toEqual(before);
    expect(feedbackCount(store)).toBe(0);
  });
});

describe("reject", () => {
  it("closes the ask without executing and records negative feedback", async () => {
    const app = await agentProposing(store, SEND_REPLY);

    const { transcript } = await app.responses.reject(1);

    expect(transcript.item!.status).toBe("rejected");
    expect(transcript.executions).toEqual([]);
    expect(transcript.feedback).toMatchObject({ kind: "reject", action: "send_reply" });
  });
});

describe("dismiss", () => {
  it("closes every injection escalation without feedback (invariant 3)", async () => {
    const app = new App({ store, model: replayModel() });
    await app.intake.run(injectionInbox());

    const results = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => app.responses.dismiss(id));

    expect(
      results.map(({ transcript: { item, executions, feedback }, promotion }) => ({
        status: item!.status,
        executions,
        feedback,
        promotion,
      })),
    ).toEqual(
      Array.from({ length: 8 }, () => ({
        status: "dismissed",
        executions: [],
        feedback: null,
        promotion: null,
      })),
    );
    expect(feedbackCount(store)).toBe(0);
  });

  it("never turns a money escalation into feedback", async () => {
    const app = await agentProposing(store, PAY_INVOICE);

    expect(app.reads.findTranscript("001")!.item!.kind).toBe("escalate");
    expect(app.responses.dismiss(1).transcript.item!.status).toBe("dismissed");
    expect(feedbackCount(store)).toBe(0);
    expect(() => app.responses.dismiss(1)).toThrow(/already dismissed/);
  });
});

describe("refusals", () => {
  it("refuses an unknown item id", async () => {
    const app = await agentProposing(store, SEND_REPLY);

    expect(() => app.responses.approve(999)).toThrow(/There is no item #999/);
  });

  it.each([
    ["undo on an ask", SEND_REPLY, (app: App) => app.responses.undo(1)],
    ["dismiss on an ask", SEND_REPLY, (app: App) => app.responses.dismiss(1)],
    ["reject on an escalation", PAY_INVOICE, (app: App) => app.responses.reject(1)],
    ["edit on an escalation", PAY_INVOICE, (app: App) => app.responses.edit(1, {})],
  ])("refuses %s without side effects", async (_, proposal, respond) => {
    const app = await agentProposing(store, proposal);
    const before = app.reads.findTranscript("001");

    await expect((async () => respond(app))()).rejects.toThrow(/takes .*, not/);
    expect(app.reads.findTranscript("001")).toEqual(before);
    expect(feedbackCount(store)).toBe(0);
  });
});

describe("notify items", () => {
  it("dismiss closes a notify item, keeps the action, records positive feedback", async () => {
    const { app, notified } = await notifiedArchive();

    const { transcript } = app.responses.dismiss(notified.item!.id);

    expect(transcript.item!.status).toBe("dismissed");
    expect(transcript.executions).toMatchObject([{ undoneAt: null }]);
    expect(store.emails.getState(notified.email.id).archivedAt).toBe(
      notified.executions[0]!.executedAt,
    );
    expect(transcript.feedback).toMatchObject({
      action: "archive",
      senderClass: "newsletter",
      kind: "dismiss",
    });
  });

  it("undo reverts a notified action and records negative feedback", async () => {
    const { app, notified } = await notifiedArchive();

    const { transcript } = app.responses.undo(notified.item!.id);

    expect(transcript.item!.status).toBe("undone");
    expect(transcript.executions).toMatchObject([{ undoneAt: expect.any(String) }]);
    expect(store.emails.getState(notified.email.id).archivedAt).toBeNull();
    expect(transcript.feedback).toMatchObject({ kind: "undo" });
  });

  it("undo twice reverts once", async () => {
    const { app, notified } = await notifiedArchive();
    const undone = app.responses.undo(notified.item!.id);
    const feedbackBefore = feedbackCount(store);

    expect(() => app.responses.undo(notified.item!.id)).toThrow(/already undone/);
    expect(app.reads.findTranscript(notified.email.id)!.executions).toMatchObject([
      { undoneAt: undone.transcript.executions[0]!.undoneAt },
    ]);
    expect(feedbackCount(store)).toBe(feedbackBefore);
  });
});

async function notifiedArchive() {
  const app = new App({ store, model: replayModel() });
  return { app, notified: await notifiedExecution(newsletterInbox(store)) };
}
