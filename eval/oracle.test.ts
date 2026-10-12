import { beforeEach, describe, expect, it } from "vitest";
import { Agent } from "../src/agent/agent.ts";
import {
  agentProposing,
  ARCHIVE,
  INBOX,
  modelProposing,
  newsletterInbox,
  NONE,
  PAY_INVOICE,
  requestsNamed,
  SEND_REPLY,
} from "../src/agent/test-agents.ts";
import type { ActionName, Proposal } from "../src/domain/actions.ts";
import { Store } from "../src/db/store.ts";
import { readScenarios, type Scenario } from "./scenarios.ts";
import { answer } from "./oracle.ts";

let store: Store;

beforeEach(() => {
  store = Store.open(":memory:");
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
      name: "approves the gold action whatever params the correction names",
      scenario: scenarioWith("send_reply", { params: { body: "Thanks!" } }),
      status: "approved",
      feedback: "approve",
      executed: SEND_REPLY,
      extractions: 0,
    },
    {
      name: "edits a wrong action to gold with the corrected params",
      scenario: scenarioWith("label", { params: { label: "reading" } }),
      status: "approved",
      feedback: "redirect",
      executed: { action: "label", params: { label: "reading" } },
      extractions: 1,
    },
    {
      name: "edits a wrong action to a gold action that takes no params",
      scenario: scenarioWith("archive"),
      status: "approved",
      feedback: "redirect",
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
    const agent = new Agent({ store, model: llm });
    await agent.run(INBOX);

    const { transcript } = (await answer(agent, scenario, agent.inbox()[0]!))!;

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
    const deliver = newsletterInbox(store);
    const agent = new Agent({ store, model: modelProposing(ARCHIVE) });
    for (let n = 0; n < 2; n++) {
      agent.approve((await deliver(ARCHIVE)).item!.id);
    }
    return { agent, delivered: await deliver(ARCHIVE) };
  }

  it.each([
    { gold: "archive", status: "dismissed", undone: false },
    { gold: "label", status: "undone", undone: true },
  ] as const)("answers $status when gold is $gold", async ({ gold, status, undone }) => {
    const { agent, delivered } = await notifyItem();

    const { transcript } = (await answer(agent, scenarioWith(gold), delivered))!;

    expect(transcript.item!.status).toBe(status);
    expect(transcript.executions[0]!.undoneAt !== null).toBe(undone);
  });
});

describe("oracle on an escalation", () => {
  it("dismisses it even when the proposal matches gold, and teaches nothing", async () => {
    const agent = await agentProposing(store, PAY_INVOICE);

    const { transcript } = (await answer(agent, scenarioWith("pay_invoice"), agent.inbox()[0]!))!;

    expect(transcript.item!.status).toBe("dismissed");
    expect(transcript.feedback).toBeNull();
    expect(transcript.executions).toEqual([]);
  });
});

describe("oracle on a silent decision", () => {
  async function silentNone() {
    const llm = modelProposing(NONE, { preferences: ["Keep it short."] });
    const agent = new Agent({ store, model: llm });
    const [silent] = await agent.run(INBOX);
    expect(silent).toMatchObject({ decision: { level: "silent" }, item: null });
    return { llm, agent, silent: silent! };
  }

  it("leaves a silent decision alone when its action matches gold", async () => {
    const { llm, agent, silent } = await silentNone();

    expect(await answer(agent, scenarioWith("none"), silent)).toBeNull();
    expect(requestsNamed(llm, "preferences")).toHaveLength(0);
  });

  it("corrects a silent decision to gold with the corrected params, executing nothing", async () => {
    const { llm, agent, silent } = await silentNone();

    const { transcript } = (await answer(
      agent,
      scenarioWith("label", { params: { label: "reading" } }),
      silent,
    ))!;

    expect(transcript.executions).toEqual([expect.objectContaining({ proposal: NONE })]);
    expect(requestsNamed(llm, "preferences")[0]).toMatch(/action.*label.*reading/);
    expect(agent.prefs()).toBe("Keep it short.");
  });
});
