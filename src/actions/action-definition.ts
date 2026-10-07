import type { z } from "zod";
import type { Db } from "../store/index.ts";

export type RiskClass = "reversible" | "external" | "irreversible" | "money";

export type ActionContext = { db: Db; emailId: string; now: string };

type ActionCommon<N extends string, S extends z.ZodObject> = {
  name: N;
  params: S;
  // Sync because effects run inside a better-sqlite3 transaction, which rejects async callbacks.
  execute(params: z.infer<S>, ctx: ActionContext): void;
};

type ReversibleAction<N extends string, S extends z.ZodObject> = ActionCommon<N, S> & {
  riskClass: "reversible";
  undo(params: z.infer<S>, ctx: ActionContext): void;
};

type OneWayAction<N extends string, S extends z.ZodObject> = ActionCommon<N, S> & {
  riskClass: Exclude<RiskClass, "reversible">;
};

export type ActionDefinition<N extends string = string, S extends z.ZodObject = z.ZodObject> =
  | ReversibleAction<N, S>
  | OneWayAction<N, S>;

export function defineAction<const N extends string, S extends z.ZodObject>(
  definition: ReversibleAction<N, S>,
): ReversibleAction<N, S>;
export function defineAction<const N extends string, S extends z.ZodObject>(
  definition: OneWayAction<N, S>,
): OneWayAction<N, S>;
export function defineAction(definition: ActionDefinition): ActionDefinition {
  return definition;
}
