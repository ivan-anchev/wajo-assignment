import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { classifySender, type Contacts } from "./inbox.ts";

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
