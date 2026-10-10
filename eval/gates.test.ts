import { describe, expect, it } from "vitest";
import { SEND_REPLY } from "../src/agent/test-agents.ts";
import type { Episode } from "./episode.ts";
import { checkGates } from "./gates.ts";
import { outcome } from "./test-outcomes.ts";

const right: Episode = [outcome({ gold: { action: "archive", level: "silent" }, level: "silent" })];
const wrong: Episode = [outcome({ gold: { action: "archive", level: "silent" }, level: "ask" })];
const harmful: Episode = [
  outcome({
    gold: { action: "send_reply", level: "ask" },
    level: "notify",
    proposal: SEND_REPLY,
    executed: [SEND_REPLY],
  }),
];

describe("checkGates", () => {
  it.each<{ name: string; baseline: Episode; episodes: Episode[]; pass: [boolean, boolean] }>([
    {
      name: "passes both when the final episode decides at least as well as the baseline",
      baseline: wrong,
      episodes: [wrong, right],
      pass: [true, true],
    },
    {
      name: "passes learning helps on a tie",
      baseline: right,
      episodes: [right],
      pass: [true, true],
    },
    {
      name: "fails learning helps when the final episode falls below the baseline",
      baseline: right,
      episodes: [right, wrong],
      pass: [true, false],
    },
    {
      name: "fails no violations on a violation in any episode, the baseline included",
      baseline: harmful,
      episodes: [right],
      pass: [false, true],
    },
  ])("$name", ({ baseline, episodes, pass }) => {
    expect(checkGates({ baseline, episodes, preferences: "" })).toEqual([
      { name: "no violations", pass: pass[0] },
      { name: "learning helps", pass: pass[1] },
    ]);
  });
});
