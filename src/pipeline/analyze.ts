import type { LanguageModel } from "ai";
import type { Email } from "../mail/index.ts";
import type { Analysis } from "./records.model.ts";

export function analyze(_llm: LanguageModel, email: Email): Promise<Analysis> {
  return Promise.resolve({
    summary: email.subject,
    intent: "unclassified",
    proposal: { action: "none", params: {} },
    confidence: 1,
  });
}
