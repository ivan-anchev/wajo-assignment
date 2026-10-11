import { beforeEach, describe, expect, it } from "vitest";
import { Store } from "../db/store.ts";
import type { Level } from "../domain/policy.ts";
import { mockModel, replayModel } from "../llm/test-models.ts";
import { createAgent, type Agent } from "./agent.ts";
import type { ResponseResult } from "./respond.ts";
import { ARCHIVE, MARK_READ, NONE, SEND_REPLY, newsletterInbox } from "./test-agents.ts";

let store: Store;
let deliver: ReturnType<typeof newsletterInbox>;
let agent: Agent;

beforeEach(() => {
  store = Store.open(":memory:");
  deliver = newsletterInbox(store);
  agent = createAgent(store, replayModel());
});

const ASK_TO_NOTIFY =
  "I will now archive newsletters without asking. `agent pin archive newsletter ask` keeps asking.";
const NOTIFY_TO_SILENT =
  "I will now archive newsletters without notifying you. " +
  "`agent pin archive newsletter notify` keeps notifying you.";

async function respondThrice(respond: (itemId: number) => ResponseResult) {
  const levels: Level[] = [];
  const promotions: (string | null)[] = [];
  for (let n = 0; n < 3; n++) {
    const { decision, item } = await deliver(ARCHIVE);
    levels.push(decision.level);
    promotions.push(respond(item!.id).promotion);
  }
  return { levels, promotions };
}

describe("learning (§7.1)", () => {
  it("climbs archive/newsletter from ask to notify to silent, announcing each step once", async () => {
    expect(await respondThrice((id) => agent.approve(id))).toEqual({
      levels: ["ask", "ask", "ask"],
      promotions: [null, null, ASK_TO_NOTIFY],
    });
    expect(await respondThrice((id) => agent.dismiss(id))).toEqual({
      levels: ["notify", "notify", "notify"],
      promotions: [null, null, NOTIFY_TO_SILENT],
    });

    const seventh = await deliver(ARCHIVE);

    expect(seventh).toMatchObject({ decision: { learned: "silent", level: "silent" }, item: null });
    expect(store.emails.getState(seventh.email.id).archivedAt).toBe(
      seventh.executions[0]!.executedAt,
    );
  });

  it("steps back one rung on undo at silent and on reject at notify, without announcing", async () => {
    await respondThrice((id) => agent.approve(id));
    await respondThrice((id) => agent.dismiss(id));

    const atSilent = await deliver(ARCHIVE, { confidence: 0.5 });
    expect(atSilent.decision).toMatchObject({ learned: "silent", brake: true, level: "notify" });
    expect(agent.undo(atSilent.item!.id).promotion).toBeNull();
    expect(store.emails.getState(atSilent.email.id).archivedAt).toBeNull();

    const atNotify = await deliver(ARCHIVE, { confidence: 0.5 });
    expect(atNotify.decision).toMatchObject({ learned: "notify", brake: true, level: "ask" });
    expect((await agent.reject(atNotify.item!.id)).promotion).toBeNull();

    expect((await deliver(ARCHIVE)).decision).toMatchObject({ learned: "ask", level: "ask" });
  });

  it("still asks for send_reply after 10 approves and never announces (invariant 2)", async () => {
    const promotions: (string | null)[] = [];
    for (let n = 0; n < 10; n++) {
      promotions.push(agent.approve((await deliver(SEND_REPLY)).item!.id).promotion);
    }

    expect(promotions).toEqual(Array.from({ length: 10 }, () => null));
    expect((await deliver(SEND_REPLY)).decision).toMatchObject({
      floor: "ask",
      learned: "notify",
      level: "ask",
    });
  });

  it("ignores an approve while the bucket is at notify", async () => {
    await respondThrice((id) => agent.approve(id));
    agent.dismiss((await deliver(ARCHIVE)).item!.id);

    const braked = await deliver(ARCHIVE, { confidence: 0.5 });
    expect(braked.decision.level).toBe("ask");
    expect(agent.approve(braked.item!.id).promotion).toBeNull();
    for (let n = 0; n < 2; n++) {
      agent.dismiss((await deliver(ARCHIVE)).item!.id);
    }

    expect((await deliver(ARCHIVE)).decision.level).toBe("silent");
  });

  it("brakes one rung up but never past ask", async () => {
    expect((await deliver(ARCHIVE, { confidence: 0.5 })).decision).toMatchObject({
      learned: "ask",
      brake: true,
      level: "ask",
    });
  });

  it("never learns or brakes an inert proposal", async () => {
    const transcript = await deliver(NONE, { confidence: 0.5 });

    expect(transcript.decision).toMatchObject({
      floor: "silent",
      learned: "silent",
      brake: false,
      level: "silent",
    });
    expect(transcript.item).toBeNull();
  });

  it("an edit that switches action on the third response announces no promotion", async () => {
    for (let n = 0; n < 2; n++) {
      agent.approve((await deliver(ARCHIVE)).item!.id);
    }
    const third = await deliver(ARCHIVE);

    const responder = createAgent(store, mockModel({ preferences: { preferences: [] } }));
    const { transcript, promotion } = await responder.edit(third.item!.id, {
      action: "mark_read",
    });

    expect(promotion).toBeNull();
    expect(transcript.feedback).toMatchObject({ action: "archive", kind: "edit" });
    expect((await deliver(MARK_READ)).decision.learned).toBe("ask");
  });

  it("words mark_read as proper English", async () => {
    const promotions: (string | null)[] = [];
    for (let n = 0; n < 3; n++) {
      promotions.push(agent.approve((await deliver(MARK_READ)).item!.id).promotion);
    }

    expect(promotions).toEqual([
      null,
      null,
      "I will now mark newsletters as read without asking. " +
        "`agent pin mark_read newsletter ask` keeps asking.",
    ]);
  });
});
