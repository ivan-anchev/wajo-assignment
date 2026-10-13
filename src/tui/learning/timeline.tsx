import { Box, Text } from "ink";
import type { Transcript } from "../../db/reads.ts";
import { isBelow, LEVELS } from "../../domain/policy.ts";
import { LevelBadge, LevelDot } from "../levels.tsx";

const TIMELINE = 60;
const TREND_WINDOW = 10;

export function Timeline({ history, legend }: { history: Transcript[]; legend: boolean }) {
  const recent = history.slice(-TIMELINE);
  const first = neededYou(history.slice(0, TREND_WINDOW));
  const last = neededYou(history.slice(-TREND_WINDOW));
  return (
    <Box flexDirection="column" marginTop={1} flexShrink={0}>
      <Text bold>Timeline</Text>
      <Text wrap="truncate-end">
        {recent.map(({ decision }) => (
          <LevelDot key={decision.id} level={decision.level} />
        ))}
        {!recent.length && <Text dimColor>no decisions yet</Text>}
      </Text>
      {legend && (
        <Text wrap="truncate-end">
          {LEVELS.toReversed().map((level) => (
            <Text key={level}>
              <LevelBadge level={level} />
              {"  "}
            </Text>
          ))}
          <Text dimColor>oldest → newest</Text>
        </Text>
      )}
      {history.length > TREND_WINDOW && (
        <Text wrap="truncate-end">
          Needed you: <Text bold>{first}%</Text> of the first {TREND_WINDOW} →{" "}
          <Text bold color={last < first ? "green" : "white"}>
            {last}%
          </Text>{" "}
          of the last {TREND_WINDOW}
        </Text>
      )}
    </Box>
  );
}

function neededYou(slice: Transcript[]): number {
  const needed = slice.filter(({ decision }) => !isBelow(decision.level, "ask"));
  return slice.length ? Math.round((100 * needed.length) / slice.length) : 0;
}
