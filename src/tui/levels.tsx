import { Box, Text } from "ink";
import type { Transcript } from "../db/reads.ts";
import type { Level } from "../domain/policy.ts";

export const LEVEL_STYLE: Record<Level, { color: string; label: string; group: string }> = {
  escalate: { color: "red", label: "Escalated", group: "Escalated" },
  ask: { color: "yellow", label: "Needs you", group: "Waiting for your answer" },
  notify: { color: "blue", label: "Done", group: "Done, undo if wrong" },
  silent: { color: "gray", label: "Handled quietly", group: "Handled quietly" },
};

const URGENCY: readonly Level[] = ["escalate", "ask", "notify", "silent"];

export function sortByUrgency(open: Transcript[]): Transcript[] {
  return open.toSorted(
    (a, b) => URGENCY.indexOf(a.decision.level) - URGENCY.indexOf(b.decision.level),
  );
}

export function LevelDot({ level }: { level: Level }) {
  return <Text color={LEVEL_STYLE[level].color}>●</Text>;
}

export function LevelBadge({ level }: { level: Level }) {
  const { color, label } = LEVEL_STYLE[level];
  return <Text color={color}>● {label}</Text>;
}

export function TitleRow({ title, level }: { title: string; level: Level }) {
  return (
    <Box justifyContent="space-between">
      <Text bold wrap="truncate-end">
        {title}
      </Text>
      <Box flexShrink={0} paddingLeft={1}>
        <LevelBadge level={level} />
      </Box>
    </Box>
  );
}
