import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../db/open-db.ts";
import { replayModel } from "../llm/test-models.ts";
import { createAgent } from "./agent.ts";
import { agentProposing, INJECTION_INBOX, NONE, SEND_REPLY } from "./test-agents.ts";

let db: Db;

beforeEach(() => {
  db = openDb(":memory:");
});

describe("inbox", () => {
  it("lists every open ask with the responses its kind allows, oldest first", async () => {
    const agent = await agentProposing(db, SEND_REPLY);

    const inbox = agent.inbox();

    expect(inbox.map((t) => t.email.id)).toEqual(["001", "002", "003"]);
    expect(inbox.map((t) => t.item)).toMatchObject(
      [1, 2, 3].map((id) => ({
        id,
        kind: "ask",
        status: "open",
        allowedResponses: ["approve", "edit", "reject"],
      })),
    );
  });

  it("lists escalations with dismiss as the only response", async () => {
    const agent = createAgent(db, replayModel());
    await agent.run(INJECTION_INBOX);

    expect(
      agent.inbox().map((t) => ({
        kind: t.item?.kind,
        allowedResponses: t.item?.allowedResponses,
        suspected: t.decision.injection.suspected,
      })),
    ).toEqual(
      Array.from({ length: 6 }, () => ({
        kind: "escalate",
        allowedResponses: ["dismiss"],
        suspected: true,
      })),
    );
  });

  it("drops an item once it is resolved", async () => {
    const agent = await agentProposing(db, SEND_REPLY);

    agent.approve(1);

    expect(agent.inbox().map((t) => t.item!.id)).toEqual([2, 3]);
  });

  it("is empty when every decision was silent", async () => {
    const agent = await agentProposing(db, NONE);

    expect(agent.inbox()).toEqual([]);
  });
});
