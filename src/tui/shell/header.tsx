import { Box, Text } from "ink";
import type { Transcript } from "../../db/reads.ts";
import { isBelow } from "../../domain/policy.ts";
import type { Progress } from "./use-delivery.ts";

export function Header({
  history,
  live,
  progress,
  thinking,
}: {
  history: Transcript[];
  live: boolean;
  progress: Progress | null;
  thinking: boolean;
}) {
  const busy = busyWords(progress, thinking);
  return (
    <Box justifyContent="space-between" marginBottom={1} flexShrink={0}>
      <Text bold>✦ Inbox agent</Text>
      <Text>
        <Text dimColor>
          {history.length} decided · {autonomy(history)}% autonomy ·{" "}
        </Text>
        <Text color="magenta">{live ? "live" : "replay"}</Text>
        {busy && <Text color="yellow"> · {busy}</Text>}
      </Text>
    </Box>
  );
}

function autonomy(history: Transcript[]): number {
  const handled = history.filter(({ decision }) => isBelow(decision.level, "ask")).length;
  return history.length ? Math.round((100 * handled) / history.length) : 0;
}

function busyWords(progress: Progress | null, thinking: boolean): string | null {
  if (progress) {
    return `thinking ${progress.at} of ${progress.total}…`;
  }
  return thinking ? "thinking…" : null;
}
