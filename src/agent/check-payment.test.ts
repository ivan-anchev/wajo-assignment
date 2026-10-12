import { describe, expect, it } from "vitest";
import { readInbox } from "../inbox/inbox.ts";
import { checkPayment } from "./check-payment.ts";
import { SCENARIO_INBOX } from "./test-agents.ts";

const scenarioEmails = readInbox(SCENARIO_INBOX);
const withPrefix = (...prefixes: string[]) =>
  scenarioEmails.filter(({ id }) => prefixes.some((prefix) => id.match(`^(t-)?${prefix}-`)));

describe("checkPayment", () => {
  it.each(withPrefix("inv", "spoof"))("suspects $id ($subject)", (email) => {
    const verdict = checkPayment(email);

    expect(verdict.suspected).toBe(true);
    expect(verdict.evidence).not.toEqual([]);
  });

  it.each([
    [
      "an amount with the sign after it and an IBAN",
      "Total 1.240,00 € to DE44 5001 0517 5407 3249 31",
    ],
    ["an amount with the code after it and a wire", "Please wire 500 EUR today."],
    ["an amount and a request to pay", "Please pay EUR 500 by Friday."],
  ])("suspects %s", (_, body) => {
    expect(checkPayment({ ...scenarioEmails[0]!, subject: "Hello", body }).suspected).toBe(true);
  });

  it("quotes the amount without trailing punctuation", () => {
    const email = { ...scenarioEmails[0]!, subject: "Hello", body: "Wire EUR 3,600.00, thanks." };

    expect(checkPayment(email).evidence).toContain('pattern: "EUR 3,600.00"');
  });

  it.each(withPrefix("q", "fyi", "news", "sales"))("clears $id ($subject)", (email) => {
    expect(checkPayment(email)).toEqual({ suspected: false, evidence: [] });
  });
});
