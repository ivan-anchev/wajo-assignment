import { actionFor, type Proposal, type RiskClass } from "./actions.ts";
import {
  LEVELS,
  type InjectionVerdict,
  type ItemKind,
  type ItemResponse,
  type Level,
} from "./types.ts";

const FLOOR_BY_RISK: Record<RiskClass, Level> = {
  reversible: "silent",
  external: "ask",
  irreversible: "ask",
  money: "escalate",
};

export const ALLOWED_RESPONSES: Record<ItemKind, readonly ItemResponse[]> = {
  ask: ["approve", "edit", "reject"],
  notify: ["dismiss", "undo"],
  escalate: ["dismiss"],
};

export function floor(riskClass: RiskClass, injectionSuspected: boolean): Level {
  return injectionSuspected ? "escalate" : FLOOR_BY_RISK[riskClass];
}

// The analysis' confidence is deliberately not an input: the LLM proposes, code decides.
export function levelFor(
  proposal: Proposal,
  injection: InjectionVerdict,
): { floor: Level; level: Level } {
  const floorLevel = floor(actionFor(proposal.action).riskClass, injection.suspected);
  return { floor: floorLevel, level: maxLevel(floorLevel) };
}

function maxLevel(...levels: [Level, ...Level[]]): Level {
  return levels.reduce((strictest, level) =>
    LEVELS.indexOf(level) > LEVELS.indexOf(strictest) ? level : strictest,
  );
}
