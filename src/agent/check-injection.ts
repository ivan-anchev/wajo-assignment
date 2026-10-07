import type { LanguageModel } from "ai";
import type { Email, InjectionVerdict } from "../domain/types.ts";

export function checkInjection(_llm: LanguageModel, _email: Email): Promise<InjectionVerdict> {
  return Promise.resolve({ suspected: false, evidence: [] });
}
