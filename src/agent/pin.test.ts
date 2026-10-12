import { beforeEach, describe, expect, it } from "vitest";
import { Store } from "../db/store.ts";
import type { ActionName } from "../domain/actions.ts";
import type { Level } from "../domain/policy.ts";
import type { SenderClass } from "../inbox/inbox.ts";
import { replayModel } from "../llm/test-models.ts";
import { App } from "../app/app.ts";
import { Refusal } from "../app/refusal.ts";
import { ARCHIVE, MARK_READ, feedbackCount, newsletterInbox } from "./test-agents.ts";

let store: Store;
let deliver: ReturnType<typeof newsletterInbox>;
let app: App;

beforeEach(() => {
  store = Store.open(":memory:");
  deliver = newsletterInbox(store);
  app = new App({ store, model: replayModel() });
});

describe("pins (§7.3)", () => {
  it("wins over a lower learned level", async () => {
    expect(app.buckets.pin("archive", "newsletter", "ask")).toEqual({
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

  it("never lowers the learned level", async () => {
    app.buckets.pin("archive", "newsletter", "silent");

    expect((await deliver(ARCHIVE)).decision).toMatchObject({
      learned: "notify",
      pin: "silent",
      level: "notify",
    });
  });

  it("replaces the previous pin", async () => {
    app.buckets.pin("archive", "newsletter", "escalate");

    expect(app.buckets.pin("archive", "newsletter", "ask")).toMatchObject({ pin: "ask" });
    expect((await deliver(ARCHIVE)).decision).toMatchObject({ pin: "ask" });
  });

  it("lets learning climb behind it, unannounced, and unpin reports the learned level", async () => {
    app.buckets.pin("archive", "newsletter", "notify");
    const promotions: (string | null)[] = [];
    for (let n = 0; n < 2; n++) {
      promotions.push(app.responses.dismiss((await deliver(ARCHIVE)).item!.id).promotion);
    }

    expect(promotions).toEqual([null, null]);
    expect(app.buckets.unpin("archive", "newsletter")).toMatchObject({
      pin: null,
      level: "silent",
    });
    expect((await deliver(ARCHIVE)).decision).toMatchObject({ pin: null, level: "silent" });
  });

  it("accepts a pin at the floor, and pin and unpin write no feedback", () => {
    expect(app.buckets.pin("send_reply", "known", "ask")).toMatchObject({ level: "ask" });
    expect(app.buckets.unpin("send_reply", "known")).toMatchObject({ pin: null, level: "ask" });
    expect(feedbackCount(store)).toBe(0);
  });

  it.each<[ActionName, SenderClass, Level]>([
    ["send_reply", "known", "notify"],
    ["delete_permanently", "first_contact", "silent"],
    ["pay_invoice", "internal", "ask"],
  ])("refuses to pin %s/%s below the floor at %s (invariant 4)", (action, senderClass, level) => {
    expect(() => app.buckets.pin(action, senderClass, level)).toThrow(Refusal);
    expect(() => app.buckets.pin(action, senderClass, level)).toThrow(/a pin can only raise it/);
    expect(store.pins.find(action, senderClass)).toBeNull();
  });

  it("holds only its own action and sender class", async () => {
    app.buckets.pin("archive", "newsletter", "ask");

    expect(app.buckets.unpin("archive", "known")).toMatchObject({ pin: null });
    expect((await deliver(MARK_READ)).decision).toMatchObject({ pin: null });
    expect((await deliver(ARCHIVE)).decision).toMatchObject({ pin: "ask" });
  });

  it("treats unpinning an unpinned bucket as a no-op", () => {
    expect(app.buckets.unpin("archive", "newsletter")).toEqual({
      action: "archive",
      senderClass: "newsletter",
      pin: null,
      level: "notify",
    });
  });
});
