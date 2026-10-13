import { expect, it } from "vitest";
import { ARCHIVE } from "../agent/test-agents.ts";
import { Store } from "../db/store.ts";
import { newsletterInbox, notifiedExecution } from "./test-apps.ts";
import { App } from "./app.ts";
import { replayModel } from "../llm/test-models.ts";

it("reset returns the store to a cold start", async () => {
  const store = Store.open(":memory:");
  const app = new App({ store, model: replayModel() });
  const deliver = newsletterInbox(store);
  const notified = await notifiedExecution(deliver);
  app.responses.dismiss(notified.item!.id);
  app.buckets.pin("archive", "newsletter", "ask");
  store.preferences.set(["Newsletters are archived."]);

  store.reset();

  expect(app.reads.recentTranscripts(10)).toEqual([]);
  expect(app.buckets.standings()).toEqual([]);
  expect(app.reads.preferences()).toBe("");
  expect(await deliver(ARCHIVE)).toMatchObject({
    decision: { id: 1, learned: "notify", pin: null },
  });
});
