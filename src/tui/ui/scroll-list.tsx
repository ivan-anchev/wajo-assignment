import { Box, Text } from "ink";
import type { ReactElement } from "react";

export function ScrollList({
  rows,
  at,
  height,
}: {
  rows: ReactElement[];
  at: number;
  height: number;
}) {
  const first = Math.max(Math.min(at - Math.floor(height / 2), rows.length - height), 0);
  return (
    <Box flexDirection="column" height={height} flexShrink={0}>
      {rows.slice(first, first + height)}
    </Box>
  );
}

export function Pointer({ selected }: { selected: boolean }) {
  return <Text color={selected ? "cyan" : "gray"}>{selected ? "› " : "  "}</Text>;
}
