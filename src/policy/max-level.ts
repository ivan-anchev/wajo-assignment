import { LEVELS, type Level } from "./level.model.ts";

export function maxLevel(...levels: [Level, ...Level[]]): Level {
  return levels.reduce((strictest, level) =>
    LEVELS.indexOf(level) > LEVELS.indexOf(strictest) ? level : strictest,
  );
}
