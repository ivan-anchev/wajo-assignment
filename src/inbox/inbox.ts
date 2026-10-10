import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { Email, SenderClass } from "../domain/types.ts";
import { readJsonFile, readJsonFiles } from "../files/json-files.ts";

export const emailFileSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  from: z.email(),
  to: z.email(),
  subject: z.string(),
  body: z.string(),
  headers: z.record(z.string(), z.string()),
  receivedAt: z.iso.datetime(),
});
export type EmailFile = z.infer<typeof emailFileSchema>;

const contactsSchema = z.object({ me: z.email(), contacts: z.array(z.email()) });
export type Contacts = z.infer<typeof contactsSchema>;

export type InboxSource = { inboxDir: string; contactsPath: string };

export function readInbox(source: InboxSource): Email[] {
  const contacts = readJsonFile(source.contactsPath, contactsSchema);
  return readJsonFiles(source.inboxDir, emailFileSchema)
    .map((file) => ({ ...file, senderClass: classifySender(file, contacts) }))
    .toSorted(byArrival);
}

export function writeInbox(emails: readonly EmailFile[], contactsPath: string): InboxSource {
  const inboxDir = mkdtempSync(join(tmpdir(), "inbox-"));

  for (const email of emails) {
    writeFileSync(join(inboxDir, `${email.id}.json`), JSON.stringify(email));
  }

  return { inboxDir, contactsPath };
}

export function classifySender(email: EmailFile, contacts: Contacts): SenderClass {
  if (domainOf(email.from) === domainOf(contacts.me)) {
    return "internal";
  }
  if (contacts.contacts.includes(email.from)) {
    return "known";
  }
  if (isBulkMail(email.headers)) {
    return "newsletter";
  }
  return "first_contact";
}

function byArrival(a: Email, b: Email): number {
  return a.receivedAt.localeCompare(b.receivedAt);
}

function domainOf(address: string): string {
  return address.slice(address.indexOf("@") + 1);
}

function isBulkMail(headers: EmailFile["headers"]): boolean {
  const precedence = headers["Precedence"];
  return "List-Unsubscribe" in headers || precedence === "bulk" || precedence === "list";
}
