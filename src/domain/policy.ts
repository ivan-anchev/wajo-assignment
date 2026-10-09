import { actionFor, type ActionName, type RiskClass } from "./actions.ts";
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
  pin: Level | null,
): Pick<Decision, "floor" | "learned" | "brake" | "level"> {
  const action = actionFor(proposal.action);
  const floorLevel = floor(action.riskClass, injection.suspected);
  if (action.inert) {
    return {
      floor: floorLevel,
      learned: "silent",
      brake: false,
      level: maxLevel(floorLevel, pin ?? "silent"),
    };
  }
  const learned = learnedLevel(history);
  const brake = confidence < BRAKE_BELOW;
  return {
    floor: floorLevel,
    learned,
    brake,
    level: maxLevel(floorLevel, pin ?? "silent", brake ? LADDER[learned].up : learned),
  };
}

export function promotion(
  action: ActionName,
  history: readonly ItemResponse[],
  response: ItemResponse,
  pin: Level | null,
): Level | null {
  const from = standingLevel(action, history, pin);
  const to = standingLevel(action, [...history, response], pin);
  return isBelow(to, from) ? from : null;
}

export function isBelow(level: Level, other: Level): boolean {
  return rank(level) < rank(other);
}

export function standingLevel(
  action: ActionName,
  history: readonly ItemResponse[],
  pin: Level | null,
): Level {
  return maxLevel(
    floor(actionFor(action).riskClass, false),
    pin ?? "silent",
    learnedLevel(history),
  );
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
  return levels.reduce((strictest, level) => (rank(level) > rank(strictest) ? level : strictest));
}

function rank(level: Level): number {
  return LEVELS.indexOf(level);
}
