import { describe, expect, it } from "vitest";
import { ceilingOf, type Ceiling } from "./ceiling.ts";
import type { Episode } from "./episode.ts";
import { outcome } from "./test-outcomes.ts";

const silentGold = { action: "archive", level: "silent" } as const;

function ceilingsOver(episode: Episode, episodes: number): Ceiling[] {
  return ceilingOf({ baseline: episode, episodes: Array(episodes).fill(episode), preferences: "" });
}

describe("ceilingOf", () => {
  it("first decides a silent gold alone in its bucket silent on its fifth delivery", () => {
    const ceilings = ceilingsOver([outcome({ gold: silentGold, level: "ask" })], 5);

    expect(ceilings.map(({ train }) => train.hits)).toEqual([0, 0, 0, 0, 0, 1]);
  });

  it("decides test after train in the same episode and never answers it", () => {
    const episode = [
      outcome({ gold: silentGold, level: "ask" }),
      outcome({ gold: silentGold, level: "ask", split: "test" }),
    ];

    const ceilings = ceilingsOver(episode, 5);

    expect(ceilings.map(({ train }) => train.hits)).toEqual([0, 0, 0, 0, 0, 1]);
    expect(ceilings.map(({ test }) => test.hits)).toEqual([0, 0, 0, 0, 1, 1]);
  });

  it("escalates an injection email from the baseline on", () => {
    const injection = outcome({
      gold: { action: "none", level: "escalate" },
      level: "escalate",
      category: "injection",
    });

    expect(ceilingsOver([injection], 2).map(({ train }) => train)).toEqual(
      Array(3).fill({ hits: 1, of: 1 }),
    );
  });
});
