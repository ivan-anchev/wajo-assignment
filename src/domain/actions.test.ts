import { beforeEach, describe, expect, it } from "vitest";
import { actionFor } from "./actions.ts";
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

describe("archive", () => {
  it("sets archivedAt on execute and clears it on undo", () => {
    actionFor("archive").execute({}, ctx());
    expect(readEmailState(db, "e1").archivedAt).toBe(NOW);

    actionFor("archive").undo({}, ctx());
    expect(readEmailState(db, "e1").archivedAt).toBeNull();
  });
});

describe("none", () => {
  it("leaves email state untouched on execute and undo", () => {
    const before = readEmailState(db, "e1");
    actionFor("none").execute({}, ctx());
    actionFor("none").undo({}, ctx());
    expect(readEmailState(db, "e1")).toEqual(before);
  });
});
