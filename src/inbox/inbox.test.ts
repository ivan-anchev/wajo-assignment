import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifySender, deliverNext, writeInbox, type Contacts } from "./inbox.ts";

const contacts: Contacts = JSON.parse(readFileSync("fixtures/contacts.json", "utf8"));

const email = {
  id: "001",
  threadId: "t-1",
  from: "maya@wajo.dev",
  to: "ivan@wajo.dev",
  subject: "Hello",
  body: "Hi",
  headers: {},
  receivedAt: "2026-10-06T08:15:00.000Z",
};

describe("classifySender", () => {
  it.each([
    ["internal", "maya@wajo.dev", {}],
    ["known", "dana@northwind.io", {}],
    ["newsletter", "digest@weekly.dev", { "List-Unsubscribe": "<mailto:u@weekly.dev>" }],
    ["newsletter", "promo@shop.dev", { Precedence: "bulk" }],
    ["newsletter", "group@lists.dev", { Precedence: "list" }],
    ["first_contact", "sam@startup.io", {}],
  ])("classifies %s from %s", (expected, from, headers) => {
    expect(classifySender({ ...email, from, headers }, contacts)).toBe(expected);
  });
});

describe("deliverNext", () => {
  it("delivers the earliest email not yet in the inbox, one per call", () => {
    const later = { ...email, id: "002", receivedAt: "2026-10-07T08:15:00.000Z" };
    const { inboxDir: fromDir } = writeInbox([later, email], "fixtures/contacts.json");
    const inboxDir = mkdtempSync(join(tmpdir(), "inbox-"));

    expect(deliverNext(fromDir, inboxDir)?.id).toBe("001");
    expect(deliverNext(fromDir, inboxDir)?.id).toBe("002");
    expect(deliverNext(fromDir, inboxDir)).toBeNull();
  });

  it("writes only the email, not the scenario fields around it", () => {
    const { inboxDir: fromDir } = writeInbox(
      [{ ...email, category: "fyi" } as typeof email],
      "fixtures/contacts.json",
    );
    const inboxDir = mkdtempSync(join(tmpdir(), "inbox-"));
    deliverNext(fromDir, inboxDir);

    expect(JSON.parse(readFileSync(join(inboxDir, "001.json"), "utf8"))).toEqual(email);
  });
});
