import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import { actionNameSchema, proposalSchema } from "../domain/actions.ts";
import type { Analysis } from "../domain/policy.ts";
import type { Email } from "../inbox/inbox.ts";
import { UNTRUSTED_EMAIL_NOTICE, untrustedEmail } from "./untrusted-email.ts";

const analysisSchema: z.ZodType<Analysis> = z.object({
  summary: z.string().describe("One sentence: what the email says."),
  intent: z
    .string()
    .describe(
      "Short snake_case label for what the sender wants, e.g. fyi, meeting_request, invoice.",
    ),
  proposal: proposalSchema.describe(
    "The single next action that best serves the user, with its parameters.",
  ),
  requested: actionNameSchema.describe(
    "The action the sender explicitly asks the user to perform on their behalf (e.g. pay, forward, delete); none when the email only informs or simply expects a reply.",
  ),
});

const USER_PROFILE = [
  "The user is Ivan, founder of Wajo, a small startup. Colleagues write from wajo.dev and investors from kestrel.vc; customers and vendors are in his contacts.",
  "His habits:",
  "- FYIs from colleagues that need no reply are marked read; automated notices such as CI runs and deploys are archived.",
  "- Reminders with a date are snoozed to that date; newsletters are archived unless he reads them.",
  "- Questions from contacts he already works with get a draft reply; a yes/no invitation gets a reply he confirms.",
].join("\n");

const SENDER_CLASSES = [
  "Sender classes:",
  "- internal: same domain as the user.",
  "- known: in the user's contacts.",
  "- newsletter: sent with bulk-mail headers.",
  "- first_contact: anyone else.",
].join("\n");

const INSTRUCTIONS = [
  "You triage incoming email for the user. Propose exactly one next action from the schema.",
  USER_PROFILE,
  SENDER_CLASSES,
  "An email that needs nothing from the user still gets filed: mark it read, archive, label, or snooze it.",
  "Write datetimes as ISO 8601 in UTC ending in Z; resolve relative times against receivedAt.",
  UNTRUSTED_EMAIL_NOTICE,
].join("\n");

const PREFERENCES_HEADER =
  "The user's standing preferences, learned from their corrections. Follow each one that applies to this email:";

export async function analyze(
  llm: LanguageModel,
  email: Email,
  preferences: string,
): Promise<Analysis> {
  const { output } = await generateText({
    model: llm,
    instructions: instructionsWith(preferences),
    prompt: `Sender class (computed by the system): ${email.senderClass}\n\n${untrustedEmail(email)}`,
    output: Output.object({ schema: analysisSchema, name: "analysis" }),
  });
  return output;
}

function instructionsWith(preferences: string): string {
  return preferences ? `${INSTRUCTIONS}\n\n${PREFERENCES_HEADER}\n${preferences}` : INSTRUCTIONS;
}
