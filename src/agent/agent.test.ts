import { beforeEach, describe, expect, it } from "vitest";
import { createAgent, type Agent } from "./agent.ts";
import { openDb } from "../db/open-db.ts";
import { mockModel, replayModel } from "../llm/test-models.ts";

const FIXTURES = { inboxDir: "fixtures/inbox", contactsPath: "fixtures/contacts.json" };

let agent: Agent;

beforeEach(() => {
  agent = createAgent(openDb(":memory:"), replayModel());
});

describe("run", () => {
  it("decides each fixture email in arrival order", async () => {
    const transcripts = await agent.run(FIXTURES);

    expect(transcripts.map((t) => [t.email.id, t.email.senderClass])).toEqual([
      ["001", "internal"],
      ["002", "newsletter"],
      ["003", "first_contact"],
    ]);
  });

  it("executes a silent proposal at the floor without opening an item", async () => {
    const llm = mockModel({
      analysis: {
        summary: "s",
        intent: "fyi",
        proposal: { action: "none", params: {} },
        confidence: 1,
      },
    });

    const [first] = await createAgent(openDb(":memory:"), llm).run(FIXTURES);

    expect(first!.decision.floor).toBe("silent");
    expect(first!.decision.level).toBe(first!.decision.floor);
    expect(first).toMatchObject({
      item: null,
      executions: [{ proposal: { action: "none", params: {} }, itemId: null }],
    });
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
