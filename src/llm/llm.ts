import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { createProviderRegistry, wrapLanguageModel, type LanguageModel } from "ai";
import { fileURLToPath } from "node:url";
import { recordReplay } from "./record-replay.ts";

export const DEFAULT_MODEL = "anthropic:claude-haiku-5-5";

const registry = createProviderRegistry({ anthropic, google, openai });

const FIXTURE_DIR = fileURLToPath(new URL("../../fixtures/llm", import.meta.url));

// The cast narrows the env string to the registry's id type; an unknown
// provider throws NoSuchProviderError at startup.
export function languageModelFrom(spec: string, { live }: { live: boolean }): LanguageModel {
  return wrapLanguageModel({
    model: registry.languageModel(
      spec as `anthropic:${string}` | `google:${string}` | `openai:${string}`,
    ),
    middleware: recordReplay({ dir: FIXTURE_DIR, live }),
  });
}
