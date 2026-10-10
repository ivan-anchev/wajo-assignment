import { fileURLToPath } from "node:url";
import { z } from "zod";
import { actionNameSchema } from "../domain/actions.ts";
import { LEVELS } from "../domain/types.ts";
import { readJsonFiles } from "../files/json-files.ts";
import { emailFileSchema } from "../inbox/inbox.ts";

const SCENARIO_DIR = fileURLToPath(new URL("../../scenarios", import.meta.url));

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
  correction: z
    .union([
      z.strictObject({ params: z.record(z.string(), z.unknown()) }),
      z.strictObject({ reason: z.string().min(1) }),
    ])
    .optional(),
});

export type Scenario = z.infer<typeof scenarioSchema>;

export function readScenarios(): Scenario[] {
  return readJsonFiles(SCENARIO_DIR, scenarioSchema);
}
