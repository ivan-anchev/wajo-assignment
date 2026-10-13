import { Box, Text } from "ink";
import type { BucketStanding } from "../../app/buckets.ts";
import type { Transcript } from "../../db/reads.ts";
import { LevelBadge } from "../levels.tsx";
import { Pointer, ScrollList } from "../ui/scroll-list.tsx";
import { bucketWords } from "../words.ts";
import { correctionCount, progressPips } from "./progress.ts";

export function BucketList({
  standings,
  history,
  at,
  height,
}: {
  standings: BucketStanding[];
  history: Transcript[];
  at: number;
  height: number;
}) {
  if (!standings.length) {
    return (
      <Box height={height}>
        <Text dimColor wrap="truncate-end">
          Nothing learned yet: answer a few items to start.
        </Text>
      </Box>
    );
  }
  return (
    <ScrollList
      rows={standings.map((standing, index) => (
        <BucketLine
          key={`${standing.action}/${standing.senderClass}`}
          standing={standing}
          corrected={correctionCount(history, standing)}
          selected={index === at}
        />
      ))}
      at={at}
      height={height}
    />
  );
}

function BucketLine({
  standing,
  corrected,
  selected,
}: {
  standing: BucketStanding;
  corrected: number;
  selected: boolean;
}) {
  return (
    <Box>
      <Box flexGrow={1} paddingRight={1}>
        <Text wrap="truncate-end" bold={selected}>
          <Pointer selected={selected} />
          {bucketWords(standing.action, standing.senderClass)}
        </Text>
      </Box>
      <Box width={18} flexShrink={0}>
        <LevelBadge level={standing.level} />
      </Box>
      <Box width={3} flexShrink={0}>
        <Text color="magenta">{progressPips(standing)}</Text>
      </Box>
      <Box width={4} flexShrink={0}>
        <Text color="magenta">{corrected ? ` ✎${corrected}` : ""}</Text>
      </Box>
    </Box>
  );
}
