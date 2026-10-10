import { beforeEach, describe, expect, it } from "vitest";
import { createAgent } from "../src/agent/agent.ts";
import {
  agentProposing,
  ARCHIVE,
  INBOX,
  modelProposing,
  newsletterInbox,
  PAY_INVOICE,
  requestsNamed,
  SEND_REPLY,
} from "../src/agent/test-agents.ts";
import { openDb, type Db } from "../src/db/open-db.ts";
import { readScenarios, type Scenario } from "../src/scenarios/scenarios.ts";
import { answer } from "./oracle.ts";

let db: Db;

beforeEach(() => {
  db = openDb(":memory:");
});

function scripted(script: Partial<Pick<Scenario, "onAsk" | "onNotify">>): Scenario {
  return { ...readScenarios()[0]!, ...script };
}

describe("oracle on an ask", () => {
  it.each([
    {
      onAsk: "approve",
      status: "approved",
      feedback: "approve",
      executed: "Sounds good.",
      extractions: 0,
    },
    { onAsk: "reject", status: "rejected", feedback: "reject", executed: null, extractions: 0 },
    {
      onAsk: { edit: { body: "Thanks!" } },
      status: "approved",
      feedback: "edit",
      executed: "Thanks!",
      extractions: 1,
    },
    {
      onAsk: { reject: "Too formal." },
      status: "rejected",
      feedback: "reject",
      executed: null,
      extractions: 1,
    },
  ] as const)(
    "answers $onAsk with $status",
    async ({ onAsk, status, feedback, executed, extractions }) => {
      const llm = modelProposing(SEND_REPLY);
      const agent = createAgent(db, llm);
      await agent.run(INBOX);

      const { transcript } = await answer(agent, scripted({ onAsk }), agent.inbox()[0]!.item!);

      expect(transcript.item!.status).toBe(status);
      expect(transcript.feedback!.kind).toBe(feedback);
      expect(transcript.executions.map(({ proposal }) => proposal.params.body)).toEqual(
        executed ? [executed] : [],
      );
      expect(requestsNamed(llm, "preference")).toHaveLength(extractions);
    },
  );

  it("learns a preference from a reasoned reject", async () => {
    const agent = createAgent(db, modelProposing(SEND_REPLY, { preference: "Keep it short." }));
    await agent.run(INBOX);

    await answer(agent, scripted({ onAsk: { reject: "Too formal." } }), agent.inbox()[0]!.item!);

    expect(agent.prefs()).toBe("Keep it short.");
  });
});

describe("oracle on a notify", () => {
  async function notifyItem() {
    const deliver = newsletterInbox(db);
    const agent = createAgent(db, modelProposing(ARCHIVE));
    for (let n = 0; n < 3; n++) {
      agent.approve((await deliver(ARCHIVE)).item!.id);
    }
    return { agent, item: (await deliver(ARCHIVE)).item! };
  }

  it.each([
    { onNotify: "dismiss", status: "dismissed", undone: false },
    { onNotify: "undo", status: "undone", undone: true },
  ] as const)("answers $onNotify", async ({ onNotify, status, undone }) => {
    const { agent, item } = await notifyItem();

    const { transcript } = await answer(agent, scripted({ onNotify }), item);

    expect(transcript.item!.status).toBe(status);
    expect(transcript.executions[0]!.undoneAt !== null).toBe(undone);
  });
});

describe("oracle on an escalation", () => {
  it("dismisses it whatever the script says and teaches nothing", async () => {
    const agent = await agentProposing(db, PAY_INVOICE);

    const { transcript } = await answer(
      agent,
      scripted({ onAsk: "approve" }),
      agent.inbox()[0]!.item!,
    );

    expect(transcript.item!.status).toBe("dismissed");
    expect(transcript.feedback).toBeNull();
    expect(transcript.executions).toEqual([]);
  });
});
