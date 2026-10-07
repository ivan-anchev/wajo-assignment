import type { Contacts } from "./contacts.model.ts";
import type { EmailFile, SenderClass } from "./email.model.ts";

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

function domainOf(address: string): string {
  return address.slice(address.indexOf("@") + 1);
}

function isBulkMail(headers: EmailFile["headers"]): boolean {
  const precedence = headers["Precedence"];
  return "List-Unsubscribe" in headers || precedence === "bulk" || precedence === "list";
}
