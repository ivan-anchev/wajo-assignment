import { fileURLToPath } from "node:url";
import { z } from "zod";
import { actionNameSchema } from "../domain/actions.ts";
import { LEVELS, type ProposalEdit } from "../domain/types.ts";
import { readJsonFiles } from "../files/json-files.ts";
import { emailFileSchema } from "../inbox/inbox.ts";

const SCENARIO_DIR = fileURLToPath(new URL("../../scenarios", import.meta.url));

const proposalEditSchema: z.ZodType<ProposalEdit> = z.record(z.string(), z.unknown());

const scenarioSchema = z.strictObject({
  ...emailFileSchema.shape,
  category: z.enum([
    "newsletter",
    "internal_fyi",
    "known_question",
    "first_contact_sales",
    "invoice",
    "spoofed_payment",
    "delete_request",
    "forward_request",
    "injection",
  ]),
  gold: z.strictObject({
    action: actionNameSchema,
    level: z.enum(LEVELS),
  }),
  onAsk: z.union([
    z.enum(["approve", "reject"]),
    z.strictObject({ edit: proposalEditSchema }),
    z.strictObject({ reject: z.string().min(1) }),
  ]),
  onNotify: z.enum(["dismiss", "undo"]),
});

export type Scenario = z.infer<typeof scenarioSchema>;

export function readScenarios(): Scenario[] {
  return readJsonFiles(SCENARIO_DIR, scenarioSchema);
}
