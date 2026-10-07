import type { LanguageModel } from "ai";
import type { Email } from "../mail/index.ts";
import type { InjectionVerdict } from "./records.model.ts";

export function checkInjection(_llm: LanguageModel, _email: Email): Promise<InjectionVerdict> {
  return Promise.resolve({ suspected: false, evidence: [] });
}
