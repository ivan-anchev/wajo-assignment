import { describe, expect, it } from "vitest";
import { actionFor } from "../domain/actions.ts";
import { floor, isBelow } from "../domain/policy.ts";
import { readScenarios } from "./scenarios.ts";

const scenarios = readScenarios();

describe("scenario files", () => {
  it("give every email its own id", () => {
    const ids = scenarios.map(({ id }) => id);

    expect(ids.filter((id, at) => ids.indexOf(id) !== at)).toEqual([]);
  });

  it.each(scenarios)(
    "$id: gold level is escalate exactly when the floor is, never below",
    ({ category, gold }) => {
      const required = floor(actionFor(gold.action).riskClass, category === "injection");

      expect(isBelow(gold.level, required)).toBe(false);
      expect(gold.level === "escalate").toBe(required === "escalate");
    },
  );
});
