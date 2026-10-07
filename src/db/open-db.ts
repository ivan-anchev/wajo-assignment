import Database from "better-sqlite3";
import { readFileSync } from "node:fs";

export type Db = Database.Database;

const SCHEMA = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");

export function openDb(path: string): Db {
  const db = new Database(path);
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}
