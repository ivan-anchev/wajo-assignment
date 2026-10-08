import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateText, wrapLanguageModel, type LanguageModel } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it } from "vitest";
import { recordReplay } from "./record-replay.ts";
import { textModel } from "./test-models.ts";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "llm-fixtures-"));
});

function wrapped(provider: MockLanguageModelV4, live: boolean): LanguageModel {
  return wrapLanguageModel({ model: provider, middleware: recordReplay({ dir, live }) });
}

async function ask(
  model: LanguageModel,
  prompt = "Hello",
  transport: { headers?: Record<string, string>; abortSignal?: AbortSignal } = {},
): Promise<string> {
  return (await generateText({ model, prompt, ...transport })).text;
}

describe("replay (default)", () => {
  it("returns the recorded answer without calling the provider", async () => {
    await ask(wrapped(textModel("recorded"), true));
    const offline = textModel("must not be called");

    expect(await ask(wrapped(offline, false))).toBe("recorded");
    expect(offline.doGenerateCalls).toEqual([]);
  });

  it("throws on a miss, naming the fixture and --live, without calling the provider", async () => {
    const offline = textModel("must not be called");

    await expect(ask(wrapped(offline, false))).rejects.toThrow(/llm-fixtures-.*\.json.*--live/s);
    expect(offline.doGenerateCalls).toEqual([]);
  });
});

describe("live", () => {
  it("records a miss as one fixture file", async () => {
    expect(await ask(wrapped(textModel("fresh"), true))).toBe("fresh");
    expect(readdirSync(dir)).toHaveLength(1);
    const fixture = JSON.parse(readFileSync(join(dir, readdirSync(dir)[0]!), "utf8"));
    expect(Object.keys(fixture)).toEqual(["request", "answer"]);
    expect(Object.keys(fixture.answer)).toEqual(["content", "finishReason", "usage", "warnings"]);
  });

  it("replays a hit instead of calling the provider again", async () => {
    await ask(wrapped(textModel("first"), true));
    const second = textModel("second");

    expect(await ask(wrapped(second, true))).toBe("first");
    expect(second.doGenerateCalls).toEqual([]);
  });
});

describe("request key", () => {
  it("changes with the prompt", async () => {
    await ask(wrapped(textModel("hello answer"), true), "Hello");

    await expect(ask(wrapped(textModel("x"), false), "Goodbye")).rejects.toThrow(/--live/);
  });

  it("ignores transport: headers and abort signal", async () => {
    await ask(wrapped(textModel("recorded"), true), "Hello", { headers: { "x-run": "1" } });

    const replayed = await ask(wrapped(textModel("x"), false), "Hello", {
      headers: { "x-run": "2" },
      abortSignal: new AbortController().signal,
    });
    expect(replayed).toBe("recorded");
  });

  it("ignores key order in call options", async () => {
    const recorded = wrapped(textModel("recorded"), true);
    await generateText({
      model: recorded,
      prompt: "Hello",
      providerOptions: { p: { a: 1, b: 2 } },
    });
    const offline = textModel("must not be called");

    const { text } = await generateText({
      model: wrapped(offline, false),
      prompt: "Hello",
      providerOptions: { p: { b: 2, a: 1 } },
    });
    expect(text).toBe("recorded");
    expect(offline.doGenerateCalls).toEqual([]);
  });

  it("changes with the model identity", async () => {
    await ask(wrapped(textModel("recorded"), true));
    const otherModel = new MockLanguageModelV4({
      modelId: "other",
      doGenerate: async () => {
        throw new Error("must not be called");
      },
    });

    await expect(ask(wrapped(otherModel, false))).rejects.toThrow(/--live/);
  });
});
