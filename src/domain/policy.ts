import { actionFor, type ActionName, type Proposal, type RiskClass } from "./actions.ts";

export const LEVELS = ["silent", "notify", "ask", "escalate"] as const;
export type Level = (typeof LEVELS)[number];
export type LearnedLevel = Exclude<Level, "escalate">;

export type ItemResponse = "approve" | "edit" | "reject" | "dismiss" | "undo";

export type Analysis = {
  summary: string;
  intent: string;
  proposal: Proposal;
  requested: ActionName;
  confidence: number;
};

export type InjectionVerdict = { suspected: boolean; evidence: string[] };

type Standing = { rung: LearnedLevel; streak: number };

const FLOOR_BY_RISK: Record<RiskClass, Level> = {
  reversible: "silent",
  external: "ask",
  irreversible: "ask",
  money: "escalate",
};

const LADDER: Record<
  LearnedLevel,
  { positives: readonly ItemResponse[]; up: LearnedLevel; down: LearnedLevel }
> = {
  silent: { positives: [], up: "notify", down: "silent" },
  notify: { positives: ["dismiss"], up: "ask", down: "silent" },
  ask: { positives: ["approve"], up: "ask", down: "notify" },
};

const COLD_START: LearnedLevel = "ask";
const NEGATIVES: readonly ItemResponse[] = ["reject", "undo", "edit"];
const STREAK_TO_PROMOTE = 3;
const BRAKE_BELOW = 0.6;

const NOTHING: Proposal = { action: "none", params: {} };

export function floor(
  [first, ...rest]: readonly [ActionName, ...ActionName[]],
  injectionSuspected: boolean,
): Level {
  return injectionSuspected ? "escalate" : maxLevel(riskFloor(first), ...rest.map(riskFloor));
}

export function proposalOf(analysis: Analysis | null): Proposal {
  return analysis?.proposal ?? NOTHING;
}

export function requestOf(analysis: Analysis | null): ActionName {
  return analysis?.requested ?? "none";
}

export function levelFor(
  analysis: Analysis | null,
  injection: InjectionVerdict,
  history: readonly ItemResponse[],
  pin: Level | null,
): { floor: Level; learned: LearnedLevel; brake: boolean; level: Level } {
  const floorLevel = floor([proposalOf(analysis).action, requestOf(analysis)], injection.suspected);
  if (!analysis || actionFor(analysis.proposal.action).inert) {
    return {
      floor: floorLevel,
      learned: "silent",
      brake: false,
      level: maxLevel(floorLevel, pin ?? "silent"),
    };
  }
  const learned = learnedLevel(history);
  const brake = analysis.confidence < BRAKE_BELOW;
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
  return maxLevel(floor([action], false), pin ?? "silent", learnedLevel(history));
}

function riskFloor(action: ActionName): Level {
  return FLOOR_BY_RISK[actionFor(action).riskClass];
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
