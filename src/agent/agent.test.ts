import type { LanguageModel } from "ai";
import { beforeEach, describe, expect, it } from "vitest";
import { createAgent } from "./agent.ts";
import { readEmailState } from "../db/mailbox.ts";
import { openDb, type Db } from "../db/open-db.ts";
import { mockModel, replayModel } from "../llm/test-models.ts";

const CONTACTS = "fixtures/contacts.json";
const INBOX = { inboxDir: "fixtures/inbox", contactsPath: CONTACTS };
const INJECTION_INBOX = { inboxDir: "fixtures/injection", contactsPath: CONTACTS };

let db: Db;

beforeEach(() => {
  db = openDb(":memory:");
});

const agentWith = (llm: LanguageModel) => createAgent(db, llm);

describe("run", () => {
  it("decides each demo email from its recorded analysis, in arrival order", async () => {
    const transcripts = await agentWith(replayModel()).run(INBOX);

    expect(
      transcripts.map((t) => [
        t.email.id,
        t.decision.analysis.proposal.action,
        t.decision.injection.suspected,
        t.decision.level,
      ]),
    ).toMatchInlineSnapshot(`
      [
        [
          "001",
          "none",
          false,
          "silent",
        ],
        [
          "002",
          "none",
          false,
          "silent",
        ],
        [
          "003",
          "draft_reply",
          false,
          "silent",
        ],
      ]
    `);
  });

  it("escalates every injection email and executes nothing", async () => {
    const transcripts = await agentWith(replayModel()).run(INJECTION_INBOX);

    expect(
      transcripts.map((t) => ({
        suspected: t.decision.injection.suspected,
        level: t.decision.level,
        item: t.item?.kind,
        allowedResponses: t.item?.allowedResponses,
        executions: t.executions,
        feedback: t.feedback,
      })),
    ).toEqual(
      Array.from({ length: 6 }, () => ({
        suspected: true,
        level: "escalate",
        item: "escalate",
        allowedResponses: ["dismiss"],
        executions: [],
        feedback: null,
      })),
    );
  });

  it("executes a silent reversible proposal and changes the email's state", async () => {
    const llm = mockModel({
      analysis: {
        summary: "s",
        intent: "fyi",
        proposal: { action: "archive", params: {} },
        confidence: 0.9,
      },
      injection_verdict: { suspected: false, evidence: [] },
    });

    const [first] = await agentWith(llm).run(INBOX);

    expect(first).toMatchObject({
      decision: { level: "silent" },
      item: null,
      executions: [{ proposal: { action: "archive", params: {} }, itemId: null }],
      feedback: null,
    });
    expect(readEmailState(db, first!.email.id).archivedAt).toBe(first!.executions[0]!.executedAt);
  });

  it("writes nothing when the judge fails, so the email is retried next run", async () => {
    const judgeDown = mockModel({
      analysis: {
        summary: "s",
        intent: "fyi",
        proposal: { action: "archive", params: {} },
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
