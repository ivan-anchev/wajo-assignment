import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { ACTIONS, executeProposal, proposalSchema, undoProposal } from "./actions.ts";
import { insertEmail, readEmailState } from "../db/mailbox.ts";
import { openDb, type Db } from "../db/open-db.ts";

const NOW = "2026-10-07T09:00:00.000Z";
let db: Db;

beforeEach(() => {
  db = openDb(":memory:");
  insertEmail(db, {
    id: "e1",
    threadId: "t1",
    from: "a@x.dev",
    to: "me@wajo.dev",
    subject: "s",
    body: "b",
    headers: {},
    receivedAt: "2026-10-07T08:00:00.000Z",
    senderClass: "first_contact",
  });
});

const ctx = () => ({ db, emailId: "e1", now: NOW });
const archive = { action: "archive" as const, params: {} };
const none = { action: "none" as const, params: {} };
const label = (name: string) => ({ action: "label" as const, params: { label: name } });

const draftCount = () =>
  db.prepare("SELECT count(*) FROM drafts WHERE email_id = ?").pluck().get("e1");

describe("archive", () => {
  it("sets archivedAt on execute and clears it on undo", () => {
    executeProposal(archive, ctx());
    expect(readEmailState(db, "e1").archivedAt).toBe(NOW);

    undoProposal(archive, ctx());
    expect(readEmailState(db, "e1").archivedAt).toBeNull();
  });
});

describe("none", () => {
  it("leaves email state untouched on execute and undo", () => {
    const before = readEmailState(db, "e1");
    executeProposal(none, ctx());
    undoProposal(none, ctx());
    expect(readEmailState(db, "e1")).toEqual(before);
  });
});

describe("undoProposal", () => {
  it("removes exactly the label it added", () => {
    executeProposal(label("a"), ctx());
    executeProposal(label("b"), ctx());

    undoProposal(label("a"), ctx());
    expect(readEmailState(db, "e1").labels).toEqual(["b"]);
  });

  it("deletes the draft that draft_reply saved", () => {
    const draftReply = { action: "draft_reply" as const, params: { body: "Thanks!" } };
    executeProposal(draftReply, ctx());
    expect(draftCount()).toBe(1);

    undoProposal(draftReply, ctx());
    expect(draftCount()).toBe(0);
  });
});

describe("proposalSchema", () => {
  it("carries every action's description into the schema the model sees", () => {
    const jsonSchema = JSON.stringify(z.toJSONSchema(proposalSchema));

    for (const { description } of ACTIONS) {
      expect(description).not.toBe("");
      expect(jsonSchema).toContain(JSON.stringify(description));
    }
  });

  it("rejects a param key the action does not declare", () => {
    const result = proposalSchema.safeParse({
      action: "send_reply",
      params: { body: "x", bdy: "y" },
    });
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ code: "unrecognized_keys", keys: ["bdy"] }),
    ]);
  });
});
