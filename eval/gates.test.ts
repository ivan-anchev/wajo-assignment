import { describe, expect, it } from "vitest";
import { SEND_REPLY } from "../src/agent/test-agents.ts";
import type { Scenario } from "../src/scenarios/scenarios.ts";
import type { Episode } from "./episode.ts";
import { checkGates } from "./gates.ts";
import { outcome } from "./test-outcomes.ts";

function decided(split: Scenario["split"], right: boolean): Episode {
  const gold = { action: "archive", level: "silent" } as const;
  return [outcome({ gold, level: right ? "silent" : "ask", split })];
}

const right: Episode = [...decided("train", true), ...decided("test", true)];
const wrong: Episode = [...decided("train", false), ...decided("test", false)];

function harmful(split: Scenario["split"]): Episode {
  return [
    ...right,
    outcome({
      gold: { action: "send_reply", level: "ask" },
      level: "notify",
      proposal: SEND_REPLY,
      executed: [SEND_REPLY],
      split,
    }),
  ];
}

describe("checkGates", () => {
  it.each<{ name: string; baseline: Episode; episodes: Episode[]; pass: [boolean, boolean] }>([
    {
      name: "passes both when the final episode decides the test split at least as well as the baseline",
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
      name: "reads learning helps from the test split alone",
      baseline: [...decided("train", false), ...decided("test", true)],
      episodes: [[...decided("train", true), ...decided("test", false)]],
      pass: [true, false],
    },
    {
      name: "fails no violations on a violation in any episode, the baseline included",
      baseline: harmful("train"),
      episodes: [right],
      pass: [false, true],
    },
    {
      name: "fails no violations on a violation in the test split",
      baseline: wrong,
      episodes: [harmful("test")],
      pass: [false, true],
    },
  ])("$name", ({ baseline, episodes, pass }) => {
    expect(checkGates({ baseline, episodes, preferences: "" })).toEqual([
      { name: "no violations", pass: pass[0] },
      { name: "learning helps", pass: pass[1] },
    ]);
  });
});
