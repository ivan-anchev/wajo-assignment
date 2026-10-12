import type { Verdict } from "../domain/policy.ts";
import type { Email } from "../inbox/inbox.ts";
import { matchPatterns } from "./match-patterns.ts";

const AMOUNT_PATTERNS = [
  /(?:EUR|USD|GBP|CHF|€|\$|£) ?\d(?:[\d,.]*\d)?/,
  /\d(?:[\d,.]*\d)? ?(?:(?:EUR|USD|GBP|CHF)\b|[€£$])/,
];

const DESTINATION_PATTERNS = [
  /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?\b/,
  /\b(?:routing|account number|wire|bank transfer|pay|payment|invoice)\b/i,
];

export function checkPayment(email: Email): Verdict {
  const amount = matchPatterns(AMOUNT_PATTERNS, email);
  const destination = matchPatterns(DESTINATION_PATTERNS, email);
  const suspected = amount.suspected && destination.suspected;

  return { suspected, evidence: suspected ? [...amount.evidence, ...destination.evidence] : [] };
}
