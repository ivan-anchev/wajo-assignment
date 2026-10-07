import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { createProviderRegistry, type LanguageModel } from "ai";

const registry = createProviderRegistry({ anthropic, openai });

// The cast narrows the env string to the registry's id type; an unknown
// provider throws NoSuchProviderError at startup.
export function languageModelFrom(spec: string): LanguageModel {
  return registry.languageModel(spec as `anthropic:${string}` | `openai:${string}`);
}
