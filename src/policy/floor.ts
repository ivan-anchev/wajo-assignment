import type { RiskClass } from "../actions/index.ts";
import type { Level } from "./level.model.ts";

const FLOOR_BY_RISK: Record<RiskClass, Level> = {
  reversible: "silent",
  external: "ask",
  irreversible: "ask",
  money: "escalate",
};

export function floor(riskClass: RiskClass, injectionSuspected: boolean): Level {
  return injectionSuspected ? "escalate" : FLOOR_BY_RISK[riskClass];
}
