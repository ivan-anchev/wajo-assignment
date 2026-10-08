import type { LanguageModel } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { DEFAULT_MODEL, languageModelFrom } from "./llm.ts";

export function replayModel(): LanguageModel {
  return languageModelFrom(DEFAULT_MODEL, { live: false });
}

export function mockModel(outputs: Record<string, object>): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: async ({ responseFormat }) =>
      answer(JSON.stringify(outputs[(responseFormat as { name: string }).name])),
  });
}

export function textModel(text: string): MockLanguageModelV4 {
  return new MockLanguageModelV4({ doGenerate: async () => answer(text) });
}

function answer(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    finishReason: { unified: "stop" as const, raw: undefined },
    usage: {
      inputTokens: {
        total: undefined,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: { total: undefined, text: undefined, reasoning: undefined },
    },
    warnings: [],
  };
}
