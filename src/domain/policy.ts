import { actionFor, type RiskClass } from "./actions.ts";
import {
  LEVELS,
  type Analysis,
  type Decision,
  type InjectionVerdict,
  type ItemKind,
  type ItemResponse,
  type LearnedLevel,
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

const LADDER: Record<
  LearnedLevel,
  { positives: readonly ItemResponse[]; up: LearnedLevel; down: LearnedLevel }
> = {
  silent: { positives: [], up: "notify", down: "silent" },
  notify: { positives: ["dismiss"], up: "ask", down: "silent" },
  ask: { positives: ["approve", "edit"], up: "ask", down: "notify" },
};

const COLD_START: LearnedLevel = "ask";
const NEGATIVES: readonly ItemResponse[] = ["reject", "undo"];
const STREAK_TO_PROMOTE = 3;
const BRAKE_BELOW = 0.6;

type Standing = { rung: LearnedLevel; streak: number };

export function levelFor(
  { proposal, confidence }: Analysis,
  injection: InjectionVerdict,
  history: readonly ItemResponse[],
): Pick<Decision, "floor" | "learned" | "brake" | "level"> {
  const action = actionFor(proposal.action);
  const floorLevel = floor(action.riskClass, injection.suspected);
  if (action.inert) {
    return { floor: floorLevel, learned: "silent", brake: false, level: floorLevel };
  }
  const learned = learnedLevel(history);
  const brake = confidence < BRAKE_BELOW;
  return {
    floor: floorLevel,
    learned,
    brake,
    level: maxLevel(floorLevel, brake ? LADDER[learned].up : learned),
  };
}

function learnedLevel(history: readonly ItemResponse[]): LearnedLevel {
  return history.reduce(climb, { rung: COLD_START, streak: 0 }).rung;
}

function climb({ rung, streak }: Standing, response: ItemResponse): Standing {
  if (NEGATIVES.includes(response)) {
    return { rung: LADDER[rung].up, streak: 0 };
  }
  if (!LADDER[rung].positives.includes(response)) {
    return { rung, streak };
  }
  return streak + 1 === STREAK_TO_PROMOTE
    ? { rung: LADDER[rung].down, streak: 0 }
    : { rung, streak: streak + 1 };
}

function maxLevel(...levels: [Level, ...Level[]]): Level {
  return levels.reduce((strictest, level) =>
    LEVELS.indexOf(level) > LEVELS.indexOf(strictest) ? level : strictest,
  );
}
