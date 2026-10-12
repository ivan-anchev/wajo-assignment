import { beforeEach, describe, expect, it } from "vitest";
import { Store } from "../db/store.ts";
import type { Level } from "../domain/policy.ts";
import { mockModel, replayModel } from "../llm/test-models.ts";
import { Agent, type ResponseResult } from "./agent.ts";
import { ARCHIVE, LABEL, MARK_READ, NONE, SEND_REPLY, newsletterInbox } from "./test-agents.ts";

let store: Store;
let deliver: ReturnType<typeof newsletterInbox>;
let agent: Agent;

beforeEach(() => {
  store = Store.open(":memory:");
  deliver = newsletterInbox(store);
  agent = new Agent({ store, model: replayModel() });
});

const ASK_TO_NOTIFY =
  "I will now archive newsletters without asking. `agent pin archive newsletter ask` keeps asking.";
const NOTIFY_TO_SILENT =
  "I will now archive newsletters without notifying you. " +
  "`agent pin archive newsletter notify` keeps notifying you.";

async function respondTwice(respond: (itemId: number) => ResponseResult) {
  const levels: Level[] = [];
  const promotions: (string | null)[] = [];
  for (let n = 0; n < 2; n++) {
    const { decision, item } = await deliver(ARCHIVE);
    levels.push(decision.level);
    promotions.push(respond(item!.id).promotion);
  }
  return { levels, promotions };
}

describe("learning (§7.1)", () => {
  it("climbs archive/newsletter from ask to notify to silent, announcing each step once", async () => {
    expect(await respondTwice((id) => agent.approve(id))).toEqual({
      levels: ["ask", "ask"],
      promotions: [null, ASK_TO_NOTIFY],
    });
    expect(await respondTwice((id) => agent.dismiss(id))).toEqual({
      levels: ["notify", "notify"],
      promotions: [null, NOTIFY_TO_SILENT],
    });

    const fifth = await deliver(ARCHIVE);

    expect(fifth).toMatchObject({ decision: { learned: "silent", level: "silent" }, item: null });
    expect(store.emails.getState(fifth.email.id).archivedAt).toBe(fifth.executions[0]!.executedAt);
  });

  it("steps back one rung on undo at silent and on reject at notify, without announcing", async () => {
    await respondTwice((id) => agent.approve(id));
    await respondTwice((id) => agent.dismiss(id));

    agent.pin("archive", "newsletter", "notify");
    const atSilent = await deliver(ARCHIVE);
    expect(atSilent.decision).toMatchObject({ learned: "silent", level: "notify" });
    expect(agent.undo(atSilent.item!.id).promotion).toBeNull();
    expect(store.emails.getState(atSilent.email.id).archivedAt).toBeNull();

    agent.pin("archive", "newsletter", "ask");
    const atNotify = await deliver(ARCHIVE);
    expect(atNotify.decision).toMatchObject({ learned: "notify", level: "ask" });
    expect((await agent.reject(atNotify.item!.id)).promotion).toBeNull();

    agent.unpin("archive", "newsletter");
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
    await respondTwice((id) => agent.approve(id));
    agent.dismiss((await deliver(ARCHIVE)).item!.id);

    agent.pin("archive", "newsletter", "ask");
    const pinned = await deliver(ARCHIVE);
    expect(pinned.decision).toMatchObject({ learned: "notify", level: "ask" });
    expect(agent.approve(pinned.item!.id).promotion).toBeNull();
    agent.unpin("archive", "newsletter");
    agent.dismiss((await deliver(ARCHIVE)).item!.id);

    expect((await deliver(ARCHIVE)).decision.level).toBe("silent");
  });

  it("never learns an inert proposal", async () => {
    const transcript = await deliver(NONE);

    expect(transcript.decision).toMatchObject({
      floor: "silent",
      learned: "silent",
      level: "silent",
    });
    expect(transcript.item).toBeNull();
  });

  it("an edit to another action neither promotes nor resets the streak, then approvals still promote", async () => {
    agent.approve((await deliver(ARCHIVE)).item!.id);
    const second = await deliver(ARCHIVE);

    const responder = new Agent({ store, model: mockModel({ preferences: { preferences: [] } }) });
    const { transcript, promotion } = await responder.edit(second.item!.id, {
      action: "mark_read",
    });

    expect(promotion).toBeNull();
    expect(transcript.feedback).toMatchObject({ action: "archive", kind: "redirect" });
    expect(agent.approve((await deliver(ARCHIVE)).item!.id).promotion).toBe(ASK_TO_NOTIFY);
    expect((await deliver(ARCHIVE)).decision).toMatchObject({ learned: "notify", level: "notify" });
    expect((await deliver(MARK_READ)).decision.learned).toBe("ask");
  });

  it("a param-only edit resets the streak", async () => {
    agent.approve((await deliver(LABEL)).item!.id);
    const second = await deliver(LABEL);

    const responder = new Agent({ store, model: mockModel({ preferences: { preferences: [] } }) });
    const { transcript } = await responder.edit(second.item!.id, { label: "receipts" });

    expect(transcript.feedback).toMatchObject({ action: "label", kind: "edit" });
    expect(agent.approve((await deliver(LABEL)).item!.id).promotion).toBeNull();
  });

  it("words mark_read as proper English", async () => {
    const promotions: (string | null)[] = [];
    for (let n = 0; n < 2; n++) {
      promotions.push(agent.approve((await deliver(MARK_READ)).item!.id).promotion);
    }

    expect(promotions).toEqual([
      null,
      "I will now mark newsletters as read without asking. " +
        "`agent pin mark_read newsletter ask` keeps asking.",
    ]);
  });
});
