import type { LanguageModel } from "ai";
import type { Analysis, Email } from "../domain/types.ts";

export function analyze(_llm: LanguageModel, email: Email): Promise<Analysis> {
  return Promise.resolve({
    summary: email.subject,
    intent: "unclassified",
    proposal: { action: "none", params: {} },
    confidence: 1,
  });
}
