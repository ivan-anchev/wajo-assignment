import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it } from "vitest";
import { createAgent, type Agent } from "./agent.ts";
import { openDb } from "../db/open-db.ts";

const FIXTURES = { inboxDir: "fixtures/inbox", contactsPath: "fixtures/contacts.json" };

let agent: Agent;
let llm: MockLanguageModelV4;

beforeEach(() => {
  llm = new MockLanguageModelV4();
  agent = createAgent(openDb(":memory:"), llm);
});

describe("run", () => {
  it("decides each fixture email at the floor, in arrival order", async () => {
    const transcripts = await agent.run(FIXTURES);

    expect(
      transcripts.map((t) => [t.email.id, t.email.senderClass, t.decision.floor, t.decision.level]),
    ).toEqual([
      ["001", "internal", "silent", "silent"],
      ["002", "newsletter", "silent", "silent"],
      ["003", "first_contact", "silent", "silent"],
    ]);
  });

  it("executes the silent none proposal without opening an item", async () => {
    const [first] = await agent.run(FIXTURES);

    expect(first).toMatchObject({
      decision: { analysis: { proposal: { action: "none" } } },
      item: null,
      executions: [{ proposal: { action: "none", params: {} }, itemId: null }],
    });
  });

  it("never calls the language model while the analyzer is a stub", async () => {
    await agent.run(FIXTURES);

    expect(llm.doGenerateCalls).toEqual([]);
    expect(llm.doStreamCalls).toEqual([]);
  });

  it("processes nothing on a second run", async () => {
    await agent.run(FIXTURES);

    expect(await agent.run(FIXTURES)).toEqual([]);
  });
});

describe("transcript", () => {
  it("returns the same transcripts run produced", async () => {
    const transcripts = await agent.run(FIXTURES);

    expect(transcripts.map((t) => agent.transcript(t.email.id))).toEqual(transcripts);
  });

  it("returns null for an unknown email id", () => {
    expect(agent.transcript("does-not-exist")).toBeNull();
  });
});
