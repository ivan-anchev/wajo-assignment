import { readdirSync } from "node:fs";
import { join } from "node:path";
import { readJsonFile } from "../shared/read-json-file.ts";
import { classifySender } from "./classify-sender.ts";
import { contactsSchema } from "./contacts.model.ts";
import { emailFileSchema, type Email, type EmailFile } from "./email.model.ts";

export type InboxSource = { inboxDir: string; contactsPath: string };

export function readInbox(source: InboxSource): Email[] {
  const contacts = readJsonFile(source.contactsPath, contactsSchema);
  return readEmailFiles(source.inboxDir)
    .map((file) => ({ ...file, senderClass: classifySender(file, contacts) }))
    .toSorted(byArrival);
}

function readEmailFiles(dir: string): EmailFile[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readJsonFile(join(dir, name), emailFileSchema));
}

function byArrival(a: Email, b: Email): number {
  return a.receivedAt.localeCompare(b.receivedAt);
}
