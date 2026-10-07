import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Email, SenderClass } from "../domain/types.ts";

const emailFileSchema = z.object({
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
  return readEmailFiles(source.inboxDir)
    .map((file) => ({ ...file, senderClass: classifySender(file, contacts) }))
    .toSorted(byArrival);
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

function readEmailFiles(dir: string): EmailFile[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readJsonFile(join(dir, name), emailFileSchema));
}

function readJsonFile<S extends z.ZodType>(path: string, schema: S): z.infer<S> {
  return schema.parse(JSON.parse(readFileSync(path, "utf8")));
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
