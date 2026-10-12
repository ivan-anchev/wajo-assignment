import type { Verdict } from "../domain/policy.ts";
import type { Email } from "../inbox/inbox.ts";

export function matchPatterns(patterns: readonly RegExp[], { subject, body }: Email): Verdict {
  const text = normalizeForMatching(`${subject}\n${body}`);
  const evidence = patterns.flatMap((pattern) => text.match(pattern)?.[0] ?? []);
  return {
    suspected: evidence.length > 0,
    evidence: evidence.map((match) => `pattern: ${JSON.stringify(match)}`),
  };
}

function normalizeForMatching(text: string): string {
  return text.replace(/\s+/g, " ").replace(/[‘’]/g, "'");
}
