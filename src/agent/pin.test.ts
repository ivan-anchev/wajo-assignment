import { beforeEach, describe, expect, it } from "vitest";
import { Store } from "../db/store.ts";
import type { ActionName } from "../domain/actions.ts";
import type { Level } from "../domain/policy.ts";
import type { SenderClass } from "../inbox/inbox.ts";
import { replayModel } from "../llm/test-models.ts";
import { Agent, Refusal } from "./agent.ts";
import { ARCHIVE, MARK_READ, feedbackCount, newsletterInbox } from "./test-agents.ts";

let store: Store;
let deliver: ReturnType<typeof newsletterInbox>;
let agent: Agent;

beforeEach(() => {
  store = Store.open(":memory:");
  deliver = newsletterInbox(store);
  agent = new Agent({ store, model: replayModel() });
});

async function learnNotify() {
  for (let n = 0; n < 3; n++) {
    agent.approve((await deliver(ARCHIVE)).item!.id);
  }
}

describe("pins (§7.3)", () => {
  it("wins over a lower learned level", async () => {
    await learnNotify();

    expect(agent.pin("archive", "newsletter", "ask")).toEqual({
      action: "archive",
      senderClass: "newsletter",
      pin: "ask",
      level: "ask",
    });
    expect(await deliver(ARCHIVE)).toMatchObject({
      decision: { learned: "notify", pin: "ask", level: "ask" },
      item: { kind: "ask" },
      executions: [],
    });
  });

  it("never lowers learned plus brake", async () => {
    await learnNotify();
    agent.pin("archive", "newsletter", "notify");

    expect((await deliver(ARCHIVE, { confidence: 0.5 })).decision).toMatchObject({
      learned: "notify",
      brake: true,
      pin: "notify",
      level: "ask",
    });
  });

  it("replaces the previous pin", async () => {
    agent.pin("archive", "newsletter", "escalate");

    expect(agent.pin("archive", "newsletter", "ask")).toMatchObject({ pin: "ask" });
    expect((await deliver(ARCHIVE)).decision).toMatchObject({ pin: "ask" });
  });

  it("lets learning climb behind it, unannounced, and unpin reports the learned level", async () => {
    agent.pin("archive", "newsletter", "ask");
    const promotions: (string | null)[] = [];
    for (let n = 0; n < 3; n++) {
      promotions.push(agent.approve((await deliver(ARCHIVE)).item!.id).promotion);
    }

    expect(promotions).toEqual([null, null, null]);
    expect(agent.unpin("archive", "newsletter")).toMatchObject({ pin: null, level: "notify" });
    expect((await deliver(ARCHIVE)).decision).toMatchObject({ pin: null, level: "notify" });
  });

  it("accepts a pin at the floor, and pin and unpin write no feedback", () => {
    expect(agent.pin("send_reply", "known", "ask")).toMatchObject({ level: "ask" });
    expect(agent.unpin("send_reply", "known")).toMatchObject({ pin: null, level: "ask" });
    expect(feedbackCount(store)).toBe(0);
  });

  it.each<[ActionName, SenderClass, Level]>([
    ["send_reply", "known", "notify"],
    ["delete_permanently", "first_contact", "silent"],
    ["pay_invoice", "internal", "ask"],
  ])("refuses to pin %s/%s below the floor at %s (invariant 4)", (action, senderClass, level) => {
    expect(() => agent.pin(action, senderClass, level)).toThrow(Refusal);
    expect(() => agent.pin(action, senderClass, level)).toThrow(/a pin can only raise it/);
    expect(store.pins.find(action, senderClass)).toBeNull();
  });

  it("holds only its own action and sender class", async () => {
    agent.pin("archive", "newsletter", "ask");

    expect(agent.unpin("archive", "known")).toMatchObject({ pin: null });
    expect((await deliver(MARK_READ)).decision).toMatchObject({ pin: null });
    expect((await deliver(ARCHIVE)).decision).toMatchObject({ pin: "ask" });
  });

  it("treats unpinning an unpinned bucket as a no-op", () => {
    expect(agent.unpin("archive", "newsletter")).toEqual({
      action: "archive",
      senderClass: "newsletter",
      pin: null,
      level: "ask",
    });
  });
});
