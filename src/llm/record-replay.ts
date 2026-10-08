import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LanguageModelMiddleware } from "ai";

type WrapGenerate = NonNullable<LanguageModelMiddleware["wrapGenerate"]>;
type GenerateCall = Parameters<WrapGenerate>[0];
type GenerateResult = Awaited<ReturnType<WrapGenerate>>;

type Answer = Pick<GenerateResult, "content" | "finishReason" | "usage" | "warnings">;

type Fixture = { request: object; answer: Answer };

export function recordReplay({
  dir,
  live,
}: {
  dir: string;
  live: boolean;
}): LanguageModelMiddleware {
  return {
    async wrapGenerate({ doGenerate, params, model }) {
      const request = requestKey(model, params);
      const path = join(dir, `${hashOf(request)}.json`);
      if (existsSync(path)) {
        return readFixture(path).answer;
      }
      if (!live) {
        throw new Error(`No LLM fixture at ${path}. Re-run with --live to record it.`);
      }
      const answer = answerOf(await doGenerate());
      writeFixture(path, { request, answer });
      return answer;
    },
  };
}

// headers: generateText injects a user-agent carrying the SDK version; abortSignal is a live object.
function requestKey(
  model: GenerateCall["model"],
  { abortSignal: _abortSignal, headers: _headers, ...callOptions }: GenerateCall["params"],
): object {
  return { model: `${model.provider}:${model.modelId}`, ...callOptions };
}

function hashOf(request: object): string {
  return createHash("sha256").update(canonicalJson(request)).digest("hex").slice(0, 16);
}

function answerOf({ content, finishReason, usage, warnings }: GenerateResult): Answer {
  return { content, finishReason, usage, warnings };
}

function readFixture(path: string): Fixture {
  return JSON.parse(readFileSync(path, "utf8")) as Fixture;
}

function writeFixture(path: string, fixture: Fixture): void {
  writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`);
}

// Sorted keys so an SDK patch that only reorders call options cannot invalidate every fixture.
function canonicalJson(value: object): string {
  return JSON.stringify(value, (_key, item) =>
    item === null || typeof item !== "object" || Array.isArray(item)
      ? item
      : Object.fromEntries(
          Object.keys(item)
            .toSorted()
            .map((key) => [key, item[key]]),
        ),
  );
}
