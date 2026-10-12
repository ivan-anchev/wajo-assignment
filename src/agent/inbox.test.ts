import { beforeEach, describe, expect, it } from "vitest";
import { Store } from "../db/store.ts";
import { replayModel } from "../llm/test-models.ts";
import { App } from "../app/app.ts";
import { agentProposing, injectionInbox, NONE, SEND_REPLY } from "./test-agents.ts";

let store: Store;

beforeEach(() => {
  store = Store.open(":memory:");
});

describe("inbox", () => {
  it("lists every open ask with the responses its kind allows, oldest first", async () => {
    const app = await agentProposing(store, SEND_REPLY);

    const inbox = app.reads.openTranscripts();

    expect(inbox.map((t) => t.email.id)).toEqual(["001", "002", "003"]);
    expect(inbox.map((t) => t.item)).toMatchObject(
      [1, 2, 3].map((id) => ({
        id,
        kind: "ask",
        status: "open",
        allowedResponses: ["approve", "edit", "reject"],
      })),
    );
  });

  it("lists escalations with dismiss as the only response", async () => {
    const app = new App({ store, model: replayModel() });
    await app.intake.run(injectionInbox());

    expect(
      app.reads.openTranscripts().map((t) => ({
        kind: t.item?.kind,
        allowedResponses: t.item?.allowedResponses,
        suspected: t.decision.injection.suspected,
      })),
    ).toEqual(
      Array.from({ length: 8 }, () => ({
        kind: "escalate",
        allowedResponses: ["dismiss"],
        suspected: true,
      })),
    );
  });

  it("drops an item once it is resolved", async () => {
    const app = await agentProposing(store, SEND_REPLY);

    app.responses.approve(1);

    expect(app.reads.openTranscripts().map((t) => t.item!.id)).toEqual([2, 3]);
  });

  it("is empty when every decision was silent", async () => {
    const app = await agentProposing(store, NONE);

    expect(app.reads.openTranscripts()).toEqual([]);
  });
});
