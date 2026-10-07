import { readFileSync } from "node:fs";
import type { z } from "zod";

export function readJsonFile<S extends z.ZodType>(path: string, schema: S): z.infer<S> {
  return schema.parse(JSON.parse(readFileSync(path, "utf8")));
}
