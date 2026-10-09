import { beforeEach, describe, expect, it } from "vitest";
import { readEmailState } from "../db/mailbox.ts";
import { openDb, type Db } from "../db/open-db.ts";
import type { Level, Transcript } from "../domain/types.ts";
import { replayModel } from "../llm/test-models.ts";
import { createAgent, type Agent } from "./agent.ts";
import { ARCHIVE, NONE, SEND_REPLY, newsletterInbox } from "./test-agents.ts";

let db: Db;
let deliver: ReturnType<typeof newsletterInbox>;
let agent: Agent;

beforeEach(() => {
  db = openDb(":memory:");
  deliver = newsletterInbox(db);
  agent = createAgent(db, replayModel());
});

async function respondThrice(respond: (itemId: number) => Transcript) {
  const levels: Level[] = [];
  for (let n = 0; n < 3; n++) {
    const { decision, item } = await deliver(ARCHIVE);
    levels.push(decision.level);
    respond(item!.id);
  }
  return { levels };
}

describe("learning (§7.1)", () => {
  it("climbs archive/newsletter from ask to notify to silent", async () => {
    expect(await respondThrice((id) => agent.approve(id))).toEqual({
      levels: ["ask", "ask", "ask"],
    });
    expect(await respondThrice((id) => agent.dismiss(id))).toEqual({
      levels: ["notify", "notify", "notify"],
    });

    const seventh = await deliver(ARCHIVE);

    expect(seventh).toMatchObject({ decision: { learned: "silent", level: "silent" }, item: null });
    expect(readEmailState(db, seventh.email.id).archivedAt).toBe(seventh.executions[0]!.executedAt);
  });

  it("steps back one rung on undo at silent and on reject at notify", async () => {
    await respondThrice((id) => agent.approve(id));
    await respondThrice((id) => agent.dismiss(id));

    const atSilent = await deliver(ARCHIVE, 0.5);
    expect(atSilent.decision).toMatchObject({ learned: "silent", brake: true, level: "notify" });
    agent.undo(atSilent.item!.id);
    expect(readEmailState(db, atSilent.email.id).archivedAt).toBeNull();

    const atNotify = await deliver(ARCHIVE, 0.5);
    expect(atNotify.decision).toMatchObject({ learned: "notify", brake: true, level: "ask" });
    agent.reject(atNotify.item!.id);

    expect((await deliver(ARCHIVE)).decision).toMatchObject({ learned: "ask", level: "ask" });
  });

  it("still asks for send_reply after 10 approves (invariant 2)", async () => {
    for (let n = 0; n < 10; n++) {
      agent.approve((await deliver(SEND_REPLY)).item!.id);
    }

    expect((await deliver(SEND_REPLY)).decision).toMatchObject({
      floor: "ask",
      learned: "notify",
      level: "ask",
    });
  });

  it("ignores an approve while the bucket is at notify", async () => {
    await respondThrice((id) => agent.approve(id));
    agent.dismiss((await deliver(ARCHIVE)).item!.id);

    const braked = await deliver(ARCHIVE, 0.5);
    expect(braked.decision.level).toBe("ask");
    agent.approve(braked.item!.id);
    for (let n = 0; n < 2; n++) {
      agent.dismiss((await deliver(ARCHIVE)).item!.id);
    }

    expect((await deliver(ARCHIVE)).decision.level).toBe("silent");
  });

  it("brakes one rung up but never past ask", async () => {
    expect((await deliver(ARCHIVE, 0.5)).decision).toMatchObject({
      learned: "ask",
      brake: true,
      level: "ask",
    });
  });

  it("never learns or brakes an inert proposal", async () => {
    const transcript = await deliver(NONE, 0.5);

    expect(transcript.decision).toMatchObject({
      floor: "silent",
      learned: "silent",
      brake: false,
      level: "silent",
    });
    expect(transcript.item).toBeNull();
  });
});
