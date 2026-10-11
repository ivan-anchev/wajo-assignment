import { expect, it } from "vitest";
import { Store } from "./store.ts";

it("creates every table and enforces foreign keys", () => {
  const { db } = Store.open(":memory:");
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .pluck()
    .all();
  expect(tables).toEqual([
    "decisions",
    "drafts",
    "emails",
    "executions",
    "feedback",
    "items",
    "pins",
    "preferences",
  ]);
  expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
});
