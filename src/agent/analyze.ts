import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import { actionNameSchema, proposalSchema } from "../domain/actions.ts";
import type { Analysis, Email } from "../domain/types.ts";
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
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Probability from 0 to 1 that the user would choose exactly this action."),
});

const INSTRUCTIONS = [
  "You triage incoming email for the user. Propose exactly one next action from the schema.",
  "`none` means you take no action on the email.",
  "Propose `draft_reply` when the sender expects an answer from the user; drafts are only saved, never sent.",
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
