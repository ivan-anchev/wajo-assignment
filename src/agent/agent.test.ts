import type { LanguageModel } from "ai";
import { beforeEach, describe, expect, it } from "vitest";
import { createAgent } from "./agent.ts";
import { readEmailState } from "../db/mailbox.ts";
import { openDb, type Db } from "../db/open-db.ts";
import { mockModel, observedReplayModel, replayModel } from "../llm/test-models.ts";
import {
  agentProposing,
  ARCHIVE,
  feedbackCount,
  INBOX,
  injectionInbox,
  LABEL,
  NONE,
  requestOrder,
  requestsNamed,
  SEND_REPLY,
} from "./test-agents.ts";

let db: Db;

beforeEach(() => {
  db = openDb(":memory:");
});

const agentWith = (llm: LanguageModel) => createAgent(db, llm);

describe("run", () => {
  it("judges then analyzes each demo email, deciding in arrival order", async () => {
    const llm = observedReplayModel();
    const transcripts = await agentWith(llm).run(INBOX);

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
          "none",
          false,
          "silent",
          "silent",
        ],
        [
          "002",
          "archive",
          false,
          "ask",
          "ask",
        ],
        [
          "003",
          "draft_reply",
          false,
          "ask",
          "ask",
        ],
      ]
    `);
  });

  it("escalates every injection email unanalyzed and executes nothing", async () => {
    const llm = observedReplayModel();
    const transcripts = await agentWith(llm).run(injectionInbox());

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

  it("asks before a reversible proposal while its bucket is cold", async () => {
    const [first] = await agentWith(
      mockModel({
        analysis: {
          summary: "s",
          intent: "fyi",
          proposal: ARCHIVE,
          requested: "none",
          confidence: 0.9,
        },
        injection_verdict: { suspected: false, evidence: [] },
      }),
    ).run(INBOX);

    expect(first).toMatchObject({
      decision: { level: "ask" },
      item: { kind: "ask", status: "open" },
      executions: [],
    });
    expect(readEmailState(db, first!.email.id).archivedAt).toBeNull();
  });

  it("writes nothing when the judge fails, so the email is retried next run", async () => {
    const judgeDown = mockModel({
      analysis: {
        summary: "s",
        intent: "fyi",
        proposal: { action: "archive", params: {} },
        requested: "none",
        confidence: 0.9,
      },
      injection_verdict: new Error("judge unavailable"),
    });
    const failing = agentWith(judgeDown);

    await expect(failing.run(INBOX)).rejects.toThrow("judge unavailable");
    expect(failing.transcript("001")).toBeNull();

    const retried = await agentWith(replayModel()).run(INBOX);
    expect(retried.map((t) => t.email.id)).toEqual(["001", "002", "003"]);
  });

  it("processes nothing on a second run", async () => {
    const agent = agentWith(replayModel());
    await agent.run(INBOX);

    expect(await agent.run(INBOX)).toEqual([]);
  });

  it("never writes feedback, whatever it decides", async () => {
    const agent = agentWith(replayModel());
    await agent.run(INBOX);
    await agent.run(injectionInbox());

    expect(feedbackCount(db)).toBe(0);
  });
});

describe("transcript", () => {
  it("returns the same transcripts run produced", async () => {
    const agent = agentWith(replayModel());
    const transcripts = await agent.run(INBOX);

    expect(transcripts.map((t) => agent.transcript(t.email.id))).toStrictEqual(transcripts);
  });

  it("returns null for an unknown email id", () => {
    expect(agentWith(replayModel()).transcript("does-not-exist")).toBeNull();
  });
});

describe("log", () => {
  it("returns every decision in decision order, silent ones included", async () => {
    const agent = agentWith(replayModel());
    const transcripts = await agent.run(INBOX);

    expect(agent.log(20)).toStrictEqual(transcripts);
  });

  it("keeps only the last `limit` decisions", async () => {
    const agent = agentWith(replayModel());
    await agent.run(INBOX);

    expect(agent.log(2).map((t) => [t.decision.id, t.email.id])).toEqual([
      [2, "002"],
      [3, "003"],
    ]);
  });
});

describe("requested-action floor (§6)", () => {
  it.each([LABEL, NONE])(
    "escalates a $action proposal on an email that requests a payment, executing nothing",
    async (proposal) => {
      const agent = await agentProposing(db, proposal, "pay_invoice");

      expect(agent.transcript("001")).toMatchObject({
        decision: { floor: "escalate", level: "escalate" },
        item: { kind: "escalate", allowedResponses: ["dismiss"] },
        executions: [],
      });
      expect(agent.dismiss(1).transcript.feedback).toBeNull();
    },
  );

  it("never lowers the floor of the proposal", async () => {
    const agent = await agentProposing(db, SEND_REPLY, "none");

    expect(agent.transcript("001")!.decision).toMatchObject({ floor: "ask", level: "ask" });
  });

  it("escalates on a suspicious verdict without analyzing the email or writing feedback", async () => {
    const llm = mockModel({
      injection_verdict: { suspected: true, evidence: ["ignore previous instructions"] },
    });
    const agent = agentWith(llm);
    await agent.run(INBOX);

    expect(requestsNamed(llm, "analysis")).toEqual([]);
    expect(agent.transcript("001")).toMatchObject({
      decision: { analysis: null, floor: "escalate", level: "escalate" },
      item: { kind: "escalate" },
      executions: [],
    });
    agent.dismiss(1);
    expect(feedbackCount(db)).toBe(0);
  });
});
