import { actionFor, type Proposal } from "../actions/index.ts";
import { floor, maxLevel, type Level } from "../policy/index.ts";
import type { InjectionVerdict } from "./records.model.ts";

// The analysis' confidence is deliberately not an input: the LLM proposes, code decides.
export function decideLevel(
  proposal: Proposal,
  injection: InjectionVerdict,
): { floor: Level; level: Level } {
  const floorLevel = floor(actionFor(proposal.action).riskClass, injection.suspected);
  return { floor: floorLevel, level: maxLevel(floorLevel) };
}
