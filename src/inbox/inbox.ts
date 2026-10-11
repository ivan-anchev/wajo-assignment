import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

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

export const SENDER_CLASSES = ["internal", "known", "newsletter", "first_contact"] as const;
export type SenderClass = (typeof SENDER_CLASSES)[number];

export type Email = EmailFile & { senderClass: SenderClass };

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

export function readJsonFile<S extends z.ZodType>(path: string, schema: S): z.infer<S> {
  const result = schema.safeParse(JSON.parse(readFileSync(path, "utf8")));
  if (!result.success) {
    throw new Error(`${path}: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export function readJsonFiles<S extends z.ZodType>(dir: string, schema: S): z.infer<S>[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .toSorted()
    .map((name) => readJsonFile(join(dir, name), schema));
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

export function byArrival(a: EmailFile, b: EmailFile): number {
  return a.receivedAt.localeCompare(b.receivedAt);
}

function domainOf(address: string): string {
  return address.slice(address.indexOf("@") + 1);
}

function isBulkMail(headers: EmailFile["headers"]): boolean {
  const precedence = headers["Precedence"];
  return "List-Unsubscribe" in headers || precedence === "bulk" || precedence === "list";
}
