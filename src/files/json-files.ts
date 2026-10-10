import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

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
