import { expect, it } from "vitest";
import { openDb } from "./open-db.ts";

it("creates every table and enforces foreign keys", () => {
  const db = openDb(":memory:");
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .pluck()
    .all();
  expect(tables).toEqual(["decisions", "drafts", "emails", "executions", "feedback", "items"]);
  expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
});
