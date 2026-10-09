import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../db/open-db.ts";
import { createAgent } from "./agent.ts";
import {
  feedbackCount,
  inboxOf,
  modelProposing,
  PAY_INVOICE_EDIT,
  requestsNamed,
  SEND_REPLY,
} from "./test-agents.ts";

const IGOR = "Replies to Igor are informal, no sign-off.";

let db: Db;

beforeEach(() => {
  db = openDb(":memory:");
});

async function askedToReply(preference: string | null | Error = IGOR) {
  const llm = modelProposing(SEND_REPLY, { preference });
  const agent = createAgent(db, llm);
  await agent.run(inboxOf("001"));
  return { llm, agent };
}

describe("preferences (§7.4)", () => {
  it("adds exactly one line for a reject with a reason", async () => {
    const { agent } = await askedToReply();

    const { transcript, preference } = await agent.reject(1, "Igor hates formal sign-offs");

    expect(preference).toBe(IGOR);
    expect(agent.prefs()).toBe(IGOR);
    expect(transcript.feedback).toMatchObject({ kind: "reject" });
  });

  it("puts learned lines into the next analyze request and shows them to the extractor", async () => {
    const { llm, agent } = await askedToReply();
    await agent.reject(1, "Igor hates formal sign-offs");

    await agent.run(inboxOf("001", "002")); // 001 is already decided; 002 becomes item #2
    await agent.edit(2, { body: "hey, sounds good" });

    const [firstAnalysis, secondAnalysis] = requestsNamed(llm, "analysis");
    expect(firstAnalysis).not.toContain(IGOR);
    expect(secondAnalysis).toContain(IGOR);
    const [, secondExtraction] = requestsNamed(llm, "preference");
    expect(secondExtraction).toContain(`<preferences>\\n${IGOR}\\n</preferences>`);
  });

  it("makes no LLM call for a reject without a reason", async () => {
    const { llm, agent } = await askedToReply();
    const calls = llm.doGenerateCalls.length;

    const { preference } = await agent.reject(1);

    expect(preference).toBeNull();
    expect(llm.doGenerateCalls).toHaveLength(calls);
    expect(agent.prefs()).toBe("");
  });

  it("appends nothing when the extractor finds nothing reusable", async () => {
    const { agent } = await askedToReply(null);

    expect((await agent.edit(1, { body: "Thanks!" })).preference).toBeNull();
    expect(agent.prefs()).toBe("");
  });

  it("shows the extractor the edit but never the email body or subject", async () => {
    const { llm, agent } = await askedToReply();

    await agent.edit(1, { body: "hey, sounds good" });

    const [request] = requestsNamed(llm, "preference");
    expect(request).toContain("hey, sounds good");
    expect(request).toContain("<untrusted_context>");
    expect(request).not.toContain("Standup moved");
    expect(request).not.toContain("Same room");
  });

  it("appends nothing for a refused edit", async () => {
    const { agent } = await askedToReply();

    await expect(agent.edit(1, PAY_INVOICE_EDIT)).rejects.toThrow(/must be escalated/);

    expect(agent.prefs()).toBe("");
    expect(agent.transcript("001")!.item!.status).toBe("open");
  });

  it("leaves the item open when extraction fails", async () => {
    const { agent } = await askedToReply(new Error("model down"));

    await expect(agent.reject(1, "too formal")).rejects.toThrow("model down");

    expect(agent.transcript("001")!.item!.status).toBe("open");
    expect(feedbackCount(db)).toBe(0);
    expect(agent.prefs()).toBe("");
  });
});
