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
import type { ActionName, Proposal } from "../src/domain/actions.ts";
import { openDb, type Db } from "../src/db/open-db.ts";
import { readScenarios, type Scenario } from "../src/scenarios/scenarios.ts";
import { answer } from "./oracle.ts";

let db: Db;

beforeEach(() => {
  db = openDb(":memory:");
});

function scenarioWith(action: ActionName, correction?: Scenario["correction"]): Scenario {
  return {
    ...readScenarios()[0]!,
    gold: { action, level: "ask" },
    ...(correction && { correction }),
  };
}

describe("oracle on an ask", () => {
  it.each<{
    name: string;
    scenario: Scenario;
    status: string;
    feedback: string;
    executed: Proposal | null;
    extractions: number;
  }>([
    {
      name: "approves a proposal that matches gold",
      scenario: scenarioWith("send_reply"),
      status: "approved",
      feedback: "approve",
      executed: SEND_REPLY,
      extractions: 0,
    },
    {
      name: "approves a gold proposal that already carries the corrected params",
      scenario: scenarioWith("send_reply", { params: { body: "Sounds good." } }),
      status: "approved",
      feedback: "approve",
      executed: SEND_REPLY,
      extractions: 0,
    },
    {
      name: "edits the gold action's params when they differ",
      scenario: scenarioWith("send_reply", { params: { body: "Thanks!" } }),
      status: "approved",
      feedback: "edit",
      executed: { action: "send_reply", params: { body: "Thanks!" } },
      extractions: 1,
    },
    {
      name: "edits a wrong action to gold with the corrected params",
      scenario: scenarioWith("label", { params: { label: "reading" } }),
      status: "approved",
      feedback: "edit",
      executed: { action: "label", params: { label: "reading" } },
      extractions: 1,
    },
    {
      name: "edits a wrong action to a gold action that takes no params",
      scenario: scenarioWith("archive"),
      status: "approved",
      feedback: "edit",
      executed: ARCHIVE,
      extractions: 1,
    },
    {
      name: "rejects a wrong action with the scenario's reason",
      scenario: scenarioWith("none", { reason: "Too formal." }),
      status: "rejected",
      feedback: "reject",
      executed: null,
      extractions: 1,
    },
    {
      name: "rejects rather than edits a wrong action when gold is inert",
      scenario: scenarioWith("none"),
      status: "rejected",
      feedback: "reject",
      executed: null,
      extractions: 0,
    },
    {
      name: "rejects a wrong action when gold takes params it cannot supply",
      scenario: scenarioWith("draft_reply"),
      status: "rejected",
      feedback: "reject",
      executed: null,
      extractions: 0,
    },
  ])("$name", async ({ scenario, status, feedback, executed, extractions }) => {
    const llm = modelProposing(SEND_REPLY, { preferences: ["Keep it short."] });
    const agent = createAgent(db, llm);
    await agent.run(INBOX);

    const { transcript } = await answer(agent, scenario, agent.inbox()[0]!.item!);

    expect(transcript.item!.status).toBe(status);
    expect(transcript.feedback!.kind).toBe(feedback);
    expect(transcript.executions.map(({ proposal }) => proposal)).toEqual(
      executed ? [executed] : [],
    );
    expect(requestsNamed(llm, "preferences")).toHaveLength(extractions);
    expect(agent.prefs()).toBe(extractions ? "Keep it short." : "");
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
    { gold: "archive", status: "dismissed", undone: false },
    { gold: "label", status: "undone", undone: true },
  ] as const)("answers $status when gold is $gold", async ({ gold, status, undone }) => {
    const { agent, item } = await notifyItem();

    const { transcript } = await answer(agent, scenarioWith(gold), item);

    expect(transcript.item!.status).toBe(status);
    expect(transcript.executions[0]!.undoneAt !== null).toBe(undone);
  });
});

describe("oracle on an escalation", () => {
  it("dismisses it even when the proposal matches gold, and teaches nothing", async () => {
    const agent = await agentProposing(db, PAY_INVOICE);

    const { transcript } = await answer(
      agent,
      scenarioWith("pay_invoice"),
      agent.inbox()[0]!.item!,
    );

    expect(transcript.item!.status).toBe("dismissed");
    expect(transcript.feedback).toBeNull();
    expect(transcript.executions).toEqual([]);
  });
});
