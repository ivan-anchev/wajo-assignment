import { beforeEach, describe, expect, it } from "vitest";
import { Store } from "../db/store.ts";
import { createAgent, type Agent } from "./agent.ts";
import {
  agentProposing,
  feedbackCount,
  inboxOf,
  modelProposing,
  PAY_INVOICE,
  PAY_INVOICE_EDIT,
  requestsNamed,
  SEND_REPLY,
} from "./test-agents.ts";

const IGOR = "Replies to Igor are informal, no sign-off.";
const IGOR_FORMAL = "Replies to Igor are formal, signed with my full name.";
const NEWSLETTERS = "Newsletters from Northwind stay in the inbox.";

let store: Store;

beforeEach(() => {
  store = Store.open(":memory:");
});

async function askedToReply(preferences: string[] | Error = [IGOR]) {
  const llm = modelProposing(SEND_REPLY, { preferences });
  const agent = createAgent(store, llm);
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
    const [, secondExtraction] = requestsNamed(llm, "preferences");
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

  it("keeps an unchanged list and reports no preference", async () => {
    store.preferences.set([IGOR]);
    const { agent } = await askedToReply([IGOR]);

    expect((await agent.edit(1, { body: "Thanks!" })).preference).toBeNull();
    expect(agent.prefs()).toBe(IGOR);
  });

  it("replaces a superseded line in place and reports it", async () => {
    store.preferences.set([IGOR, NEWSLETTERS]);
    const { agent } = await askedToReply([IGOR_FORMAL, NEWSLETTERS]);

    const { preference } = await agent.reject(1, "Igor wants formal replies after all");

    expect(preference).toBe(IGOR_FORMAL);
    expect(agent.prefs()).toBe(`${IGOR_FORMAL}\n${NEWSLETTERS}`);
  });

  it("stores a two-line change but names no single preference", async () => {
    store.preferences.set([IGOR]);
    const { agent } = await askedToReply([IGOR_FORMAL, NEWSLETTERS]);

    const { preference } = await agent.reject(1, "Igor wants formal replies after all");

    expect(preference).toBeNull();
    expect(agent.prefs()).toBe(`${IGOR_FORMAL}\n${NEWSLETTERS}`);
  });

  it("discards an answer longer than 30 lines and still commits the response", async () => {
    store.preferences.set([IGOR]);
    const { agent } = await askedToReply([IGOR, ...numbered(30)]);

    const { transcript, preference } = await agent.reject(1, "too formal");

    expect(preference).toBeNull();
    expect(transcript.item!.status).toBe("rejected");
    expect(agent.prefs()).toBe(IGOR);
  });

  it("discards an answer that drops two current lines and still commits the response", async () => {
    store.preferences.set([IGOR, NEWSLETTERS, "Invoices from Acme are paid by Dana."]);
    const { agent } = await askedToReply([IGOR_FORMAL]);

    const { transcript, preference } = await agent.reject(1, "Igor wants formal replies after all");

    expect(preference).toBeNull();
    expect(transcript.item!.status).toBe("rejected");
    expect(agent.prefs()).toBe(`${IGOR}\n${NEWSLETTERS}\nInvoices from Acme are paid by Dana.`);
  });

  it("shows the extractor the edit but never the email body or subject", async () => {
    const { llm, agent } = await askedToReply();

    await agent.edit(1, { body: "hey, sounds good" });

    const [request] = requestsNamed(llm, "preferences");
    expect(request).toContain("hey, sounds good");
    expect(request).toContain("<untrusted_context>");
    expect(request).not.toContain("Standup moved");
    expect(request).not.toContain("Same room");
  });

  it("writes no preference for a refused edit", async () => {
    const { agent } = await askedToReply();

    await expect(agent.edit(1, PAY_INVOICE_EDIT)).rejects.toThrow(/must be escalated/);

    expect(agent.prefs()).toBe("");
    expect(agent.transcript("001")!.item!.status).toBe("open");
  });

  it("leaves the item open when extraction fails", async () => {
    const { agent } = await askedToReply(new Error("model down"));

    await expect(agent.reject(1, "too formal")).rejects.toThrow("model down");

    expect(agent.transcript("001")!.item!.status).toBe("open");
    expect(feedbackCount(store)).toBe(0);
    expect(agent.prefs()).toBe("");
  });

  it.each([
    [
      "an edit on a resolved ask",
      rejectedAsk,
      (agent: Agent) => agent.edit(1, {}),
      /already rejected/,
    ],
    [
      "a reasoned reject on a resolved ask",
      rejectedAsk,
      (agent: Agent) => agent.reject(1, "too formal"),
      /already rejected/,
    ],
    [
      "an edit the registry schema refuses",
      openAsk,
      (agent: Agent) => agent.edit(1, { amount: 120 }),
      /Invalid edit/,
    ],
    [
      "an edit the floor escalates",
      openAsk,
      (agent: Agent) => agent.edit(1, PAY_INVOICE_EDIT),
      /must be escalated/,
    ],
    ["an edit on an escalation", escalation, (agent: Agent) => agent.edit(1, {}), /not edit/],
    [
      "a reasoned reject on an escalation",
      escalation,
      (agent: Agent) => agent.reject(1, "not ours"),
      /not reject/,
    ],
    ["an edit on an unknown item", openAsk, (agent: Agent) => agent.edit(99, {}), /no item #99/],
    [
      "a reasoned reject on an unknown item",
      openAsk,
      (agent: Agent) => agent.reject(99, "not ours"),
      /no item #99/,
    ],
  ])("refuses %s before any extraction call", async (_, setUp, respond, refusal) => {
    await setUp();
    const llm = modelProposing(SEND_REPLY);

    await expect(respond(createAgent(store, llm))).rejects.toThrow(refusal);

    expect(llm.doGenerateCalls).toEqual([]);
  });
});

function openAsk() {
  return agentProposing(store, SEND_REPLY);
}

async function rejectedAsk() {
  await (await openAsk()).reject(1);
}

function escalation() {
  return agentProposing(store, PAY_INVOICE);
}

function numbered(count: number): string[] {
  return Array.from({ length: count }, (_, n) => `Preference ${n + 1}.`);
}
