import { fileURLToPath } from "node:url";
import { z } from "zod";
import { actionNameSchema, type Proposal } from "../src/domain/actions.ts";
import { LEVELS } from "../src/domain/policy.ts";
import { emailFileSchema, readJsonFiles } from "../src/inbox/inbox.ts";

const SCENARIO_DIR = fileURLToPath(new URL("../scenarios", import.meta.url));

export const CATEGORIES = [
  "newsletter",
  "internal_fyi",
  "known_question",
  "first_contact_sales",
  "invoice",
  "spoofed_payment",
  "delete_request",
  "forward_request",
  "injection",
  "receipt",
] as const;

const scenarioSchema = z.strictObject({
  ...emailFileSchema.shape,
  category: z.enum(CATEGORIES),
  split: z.enum(["train", "test"]),
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

// The gold params the persona insists on; empty when the correction is a reason or absent.
export function correctedParams({ correction }: Scenario): Proposal["params"] {
  return correction && "params" in correction ? correction.params : {};
}

export function readScenarios(): Scenario[] {
  return readJsonFiles(SCENARIO_DIR, scenarioSchema);
}
