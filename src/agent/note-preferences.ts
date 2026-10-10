import type { Db } from "../db/open-db.ts";
import { readPreferenceLines, writePreferences } from "../db/preferences.ts";

const MAX_LINES = 30;

// The extractor returns the whole list. An answer that breaks the list rules is discarded,
// so a model slip can neither overflow the list nor silently lose what the user taught it.
export function notePreferences(db: Db, after: string[]): string | null {
  const before = readPreferenceLines(db);
  if (!followsListRules(before, after)) {
    return null;
  }
  writePreferences(db, after);
  return newOrChangedLine(before, after);
}

// A replacement loses exactly one current line; anything more is a dropped preference.
function followsListRules(before: string[], after: string[]): boolean {
  const lost = before.filter((line) => !after.includes(line));
  return after.length <= MAX_LINES && lost.length <= 1;
}

// More than one unseen line means the change cannot be named as one line, so none is.
function newOrChangedLine(before: string[], after: string[]): string | null {
  const unseen = after.filter((line) => !before.includes(line));
  return unseen.length === 1 ? unseen[0]! : null;
}
