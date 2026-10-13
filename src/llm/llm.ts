import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { createProviderRegistry, wrapLanguageModel, type Warning } from "ai";
import { fileURLToPath } from "node:url";
import { recordReplay } from "./record-replay.ts";

export const DEFAULT_MODEL = "anthropic:claude-haiku-5-5";

const registry = createProviderRegistry({ anthropic, google, openai });

// @ai-sdk/anthropic predates claude-haiku-5-5, so every call (and every fixture replaying one)
// warns that it capped max output tokens; setting maxOutputTokens would change every fixture key.
globalThis.AI_SDK_LOG_WARNINGS = ({ warnings }) => {
  for (const warning of warnings.filter((each) => !isUnknownModelCap(each))) {
    console.warn("AI SDK warning:", warning);
  }
};

function isUnknownModelCap(warning: Warning): boolean {
  return warning.type === "compatibility" && warning.feature === "maxOutputTokens";
}

const FIXTURE_DIR = fileURLToPath(new URL("../../fixtures/llm", import.meta.url));

export function languageModelFrom(
  spec: string,
  { live }: { live: boolean },
): ReturnType<typeof wrapLanguageModel> {
  return wrapLanguageModel({
    model: registry.languageModel(
      spec as `anthropic:${string}` | `google:${string}` | `openai:${string}`,
    ),
    middleware: recordReplay({ dir: FIXTURE_DIR, live }),
  });
}
