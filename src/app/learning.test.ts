import { beforeEach, describe, expect, it } from "vitest";
import { ARCHIVE, LABEL, MARK_READ, NONE, SEND_REPLY } from "../agent/test-agents.ts";
import { renderPromotion } from "../cli/render.ts";
import { Store } from "../db/store.ts";
import type { Level } from "../domain/policy.ts";
import { mockModel, replayModel } from "../llm/test-models.ts";
import { App } from "./app.ts";
import type { ResponseResult } from "./responses.ts";
import { newsletterInbox } from "./test-apps.ts";

let store: Store;
let deliver: ReturnType<typeof newsletterInbox>;
let app: App;

beforeEach(() => {
  store = Store.open(":memory:");
  deliver = newsletterInbox(store);
  app = new App({ store, model: replayModel() });
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
    promotions.push(renderPromotion(respond(item!.id)));
  }
  return { levels, promotions };
}

describe("learning (§7.1)", () => {
  it("climbs archive/newsletter from notify to silent, announcing the step once", async () => {
    expect(await respondTwice((id) => app.responses.dismiss(id))).toEqual({
      levels: ["notify", "notify"],
      promotions: [null, NOTIFY_TO_SILENT],
    });

    const third = await deliver(ARCHIVE);

    expect(third).toMatchObject({ decision: { learned: "silent", level: "silent" }, item: null });
    expect(store.emails.getState(third.email.id).archivedAt).toBe(third.executions[0]!.executedAt);
  });

  it("climbs back from ask to notify after an undo, announcing the step once", async () => {
    expect(app.responses.undo((await deliver(ARCHIVE)).item!.id).promotion).toBeNull();

    expect(await respondTwice((id) => app.responses.approve(id))).toEqual({
      levels: ["ask", "ask"],
      promotions: [null, ASK_TO_NOTIFY],
    });
    expect((await deliver(ARCHIVE)).decision).toMatchObject({ learned: "notify", level: "notify" });
  });

  it("steps back one rung on undo at silent and on reject at notify, without announcing", async () => {
    await respondTwice((id) => app.responses.dismiss(id));

    app.buckets.pin("archive", "newsletter", "notify");
    const atSilent = await deliver(ARCHIVE);
    expect(atSilent.decision).toMatchObject({ learned: "silent", level: "notify" });
    expect(app.responses.undo(atSilent.item!.id).promotion).toBeNull();
    expect(store.emails.getState(atSilent.email.id).archivedAt).toBeNull();

    app.buckets.pin("archive", "newsletter", "ask");
    const atNotify = await deliver(ARCHIVE);
    expect(atNotify.decision).toMatchObject({ learned: "notify", level: "ask" });
    expect((await app.responses.reject(atNotify.item!.id)).promotion).toBeNull();

    app.buckets.unpin("archive", "newsletter");
    expect((await deliver(ARCHIVE)).decision).toMatchObject({ learned: "ask", level: "ask" });
  });

  it("still asks for send_reply after 10 approves and never announces (invariant 2)", async () => {
    const promotions: (string | null)[] = [];
    for (let n = 0; n < 10; n++) {
      promotions.push(app.responses.approve((await deliver(SEND_REPLY)).item!.id).promotion);
    }

    expect(promotions).toEqual(Array.from({ length: 10 }, () => null));
    expect((await deliver(SEND_REPLY)).decision).toMatchObject({
      floor: "ask",
      learned: "notify",
      level: "ask",
    });
  });

  it("ignores an approve while the bucket is at notify", async () => {
    app.responses.dismiss((await deliver(ARCHIVE)).item!.id);

    app.buckets.pin("archive", "newsletter", "ask");
    const pinned = await deliver(ARCHIVE);
    expect(pinned.decision).toMatchObject({ learned: "notify", level: "ask" });
    expect(app.responses.approve(pinned.item!.id).promotion).toBeNull();
    app.buckets.unpin("archive", "newsletter");
    app.responses.dismiss((await deliver(ARCHIVE)).item!.id);

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
    app.responses.undo((await deliver(ARCHIVE)).item!.id);
    app.responses.approve((await deliver(ARCHIVE)).item!.id);
    const second = await deliver(ARCHIVE);

    const responder = new App({ store, model: mockModel({ preferences: { preferences: [] } }) });
    const { transcript, promotion } = await responder.responses.edit(second.item!.id, {
      action: "mark_read",
    });

    expect(promotion).toBeNull();
    expect(transcript.feedback).toMatchObject({ action: "archive", kind: "redirect" });
    expect(renderPromotion(app.responses.approve((await deliver(ARCHIVE)).item!.id))).toBe(
      ASK_TO_NOTIFY,
    );
    expect((await deliver(ARCHIVE)).decision).toMatchObject({ learned: "notify", level: "notify" });
    expect((await deliver(MARK_READ)).decision.learned).toBe("notify");
  });

  it("a param-only edit resets the streak", async () => {
    app.responses.undo((await deliver(LABEL)).item!.id);
    app.responses.approve((await deliver(LABEL)).item!.id);
    const second = await deliver(LABEL);

    const responder = new App({ store, model: mockModel({ preferences: { preferences: [] } }) });
    const { transcript } = await responder.responses.edit(second.item!.id, { label: "receipts" });

    expect(transcript.feedback).toMatchObject({ action: "label", kind: "edit" });
    expect(app.responses.approve((await deliver(LABEL)).item!.id).promotion).toBeNull();
  });

  it("words mark_read as proper English", async () => {
    const promotions: (string | null)[] = [];
    for (let n = 0; n < 2; n++) {
      promotions.push(renderPromotion(app.responses.dismiss((await deliver(MARK_READ)).item!.id)));
    }

    expect(promotions).toEqual([
      null,
      "I will now mark newsletters as read without notifying you. " +
        "`agent pin mark_read newsletter notify` keeps notifying you.",
    ]);
  });
});
