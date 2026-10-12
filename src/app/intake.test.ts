import type { LanguageModel } from "ai";
import { beforeEach, describe, expect, it } from "vitest";
import {
  ARCHIVE,
  INBOX,
  injectionInbox,
  LABEL,
  modelProposing,
  NONE,
  requestOrder,
  requestsNamed,
  SEND_REPLY,
} from "../agent/test-agents.ts";
import { Store } from "../db/store.ts";
import { readInbox, writeInbox } from "../inbox/inbox.ts";
import { mockModel, observedReplayModel, replayModel } from "../llm/test-models.ts";
import { App } from "./app.ts";
import { agentProposing, feedbackCount } from "./test-apps.ts";

let store: Store;

beforeEach(() => {
  store = Store.open(":memory:");
});

const appWith = (llm: LanguageModel) => new App({ store, model: llm });

describe("run", () => {
  it("judges then analyzes each demo email, deciding in arrival order", async () => {
    const llm = observedReplayModel();
    const transcripts = await appWith(llm).intake.run(INBOX);

    expect(requestOrder(llm)).toEqual(
      Array.from({ length: 3 }, () => ["injection_verdict", "analysis"]).flat(),
    );

    expect(
      transcripts.map((t) => [
        t.email.id,
        t.decision.analysis?.proposal.action,
        t.decision.injection.suspected,
        t.decision.learned,
        t.decision.level,
      ]),
    ).toMatchInlineSnapshot(`
      [
        [
          "001",
          "mark_read",
          false,
          "notify",
          "notify",
        ],
        [
          "002",
          "archive",
          false,
          "notify",
          "notify",
        ],
        [
          "003",
          "draft_reply",
          false,
          "notify",
          "notify",
        ],
      ]
    `);
  });

  it("escalates every injection email unanalyzed and executes nothing", async () => {
    const llm = observedReplayModel();
    const transcripts = await appWith(llm).intake.run(injectionInbox());

    expect(requestsNamed(llm, "injection_verdict")).toHaveLength(8);
    expect(requestsNamed(llm, "analysis")).toEqual([]);
    expect(
      transcripts.map((t) => ({
        suspected: t.decision.injection.suspected,
        analysis: t.decision.analysis,
        level: t.decision.level,
        item: t.item?.kind,
        allowedResponses: t.item?.allowedResponses,
        executions: t.executions,
        feedback: t.feedback,
      })),
    ).toEqual(
      Array.from({ length: 8 }, () => ({
        suspected: true,
        analysis: null,
        level: "escalate",
        item: "escalate",
        allowedResponses: ["dismiss"],
        executions: [],
        feedback: null,
      })),
    );
  });

  it("acts on a reversible proposal and notifies while its bucket is cold", async () => {
    const [first] = await appWith(
      mockModel({
        analysis: {
          summary: "s",
          intent: "fyi",
          proposal: ARCHIVE,
          requested: "none",
        },
        injection_verdict: { suspected: false, evidence: [] },
      }),
    ).intake.run(INBOX);

    expect(first).toMatchObject({
      decision: { level: "notify" },
      item: { kind: "notify", status: "open" },
      executions: [{ proposal: ARCHIVE, undoneAt: null }],
    });
    expect(store.emails.getState(first!.email.id).archivedAt).toBe(
      first!.executions[0]!.executedAt,
    );
  });

  it("writes nothing when the judge fails, so the email is retried next run", async () => {
    const judgeDown = mockModel({
      analysis: {
        summary: "s",
        intent: "fyi",
        proposal: { action: "archive", params: {} },
        requested: "none",
      },
      injection_verdict: new Error("judge unavailable"),
    });
    const failing = appWith(judgeDown);

    await expect(failing.intake.run(INBOX)).rejects.toThrow("judge unavailable");
    expect(failing.reads.findTranscript("001")).toBeNull();

    const retried = await appWith(replayModel()).intake.run(INBOX);
    expect(retried.map((t) => t.email.id)).toEqual(["001", "002", "003"]);
  });

  it("processes nothing on a second run", async () => {
    const app = appWith(replayModel());
    await app.intake.run(INBOX);

    expect(await app.intake.run(INBOX)).toEqual([]);
  });

  it("never writes feedback, whatever it decides", async () => {
    const app = appWith(replayModel());
    await app.intake.run(INBOX);
    await app.intake.run(injectionInbox());

    expect(feedbackCount(store)).toBe(0);
  });
});

describe("transcript", () => {
  it("returns the same transcripts run produced", async () => {
    const app = appWith(replayModel());
    const transcripts = await app.intake.run(INBOX);

    expect(transcripts.map((t) => app.reads.findTranscript(t.email.id))).toStrictEqual(transcripts);
  });

  it("returns null for an unknown email id", () => {
    expect(appWith(replayModel()).reads.findTranscript("does-not-exist")).toBeNull();
  });
});

describe("log", () => {
  it("returns every decision in decision order, silent ones included", async () => {
    const app = appWith(replayModel());
    const transcripts = await app.intake.run(INBOX);

    expect(app.reads.recentTranscripts(20)).toStrictEqual(transcripts);
  });

  it("keeps only the last `limit` decisions", async () => {
    const app = appWith(replayModel());
    await app.intake.run(INBOX);

    expect(app.reads.recentTranscripts(2).map((t) => [t.decision.id, t.email.id])).toEqual([
      [2, "002"],
      [3, "003"],
    ]);
  });
});

describe("requested-action floor (§6)", () => {
  it.each([LABEL, NONE])(
    "escalates a $action proposal on an email that requests a payment, executing nothing",
    async (proposal) => {
      const app = await agentProposing(store, proposal, "pay_invoice");

      expect(app.reads.findTranscript("001")).toMatchObject({
        decision: { floor: "escalate", level: "escalate" },
        item: { kind: "escalate", allowedResponses: ["dismiss"] },
        executions: [],
      });
      expect(app.responses.dismiss(1).transcript.feedback).toBeNull();
    },
  );

  it("never lowers the floor of the proposal", async () => {
    const app = await agentProposing(store, SEND_REPLY, "none");

    expect(app.reads.findTranscript("001")!.decision).toMatchObject({ floor: "ask", level: "ask" });
  });

  it("escalates an email carrying an IBAN and an amount even when nothing is proposed or requested", async () => {
    const [demo] = readInbox(INBOX);
    const invoice = {
      ...demo!,
      body: "Amount due: EUR 1,240.00. IBAN DE44 5001 0517 5407 3249 31.",
    };
    const app = new App({ store, model: modelProposing(LABEL, { requested: "none" }) });

    await app.intake.run(writeInbox([invoice], INBOX.contactsPath));

    expect(app.reads.findTranscript("001")).toMatchObject({
      decision: { payment: { suspected: true }, floor: "escalate", level: "escalate" },
      item: { kind: "escalate" },
      executions: [],
    });
  });

  it("escalates on a suspicious verdict without analyzing the email or writing feedback", async () => {
    const llm = mockModel({
      injection_verdict: { suspected: true, evidence: ["ignore previous instructions"] },
    });
    const app = appWith(llm);
    await app.intake.run(INBOX);

    expect(requestsNamed(llm, "analysis")).toEqual([]);
    expect(app.reads.findTranscript("001")).toMatchObject({
      decision: { analysis: null, floor: "escalate", level: "escalate" },
      item: { kind: "escalate" },
      executions: [],
    });
    app.responses.dismiss(1);
    expect(feedbackCount(store)).toBe(0);
  });
});
