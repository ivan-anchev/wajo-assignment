import { Box, Text } from "ink";
import type { ReactElement } from "react";
import type { Transcript } from "../../db/reads.ts";
import type { Level } from "../../domain/policy.ts";
import { LEVEL_STYLE, LevelDot } from "../levels.tsx";
import { Pointer, ScrollList } from "../ui/scroll-list.tsx";
import { whatIWant } from "../words.ts";

type Line = { element: ReactElement; selected: boolean };

export function ItemList({
  open,
  cursor,
  height,
}: {
  open: Transcript[];
  cursor: number;
  height: number;
}) {
  const lines = listLines(open, cursor);
  return (
    <ScrollList
      rows={lines.map((line) => line.element)}
      at={lines.findIndex((line) => line.selected)}
      height={height}
    />
  );
}

function listLines(open: Transcript[], cursor: number): Line[] {
  return open.flatMap((transcript, index) => {
    const level = transcript.decision.level;
    const startsGroup = open[index - 1]?.decision.level !== level;
    const inGroup = open.filter((t) => t.decision.level === level).length;
    return [
      ...(startsGroup ? groupLines(level, inGroup, index > 0) : []),
      ...itemLines(transcript, index === cursor),
    ];
  });
}

function groupLines(level: Level, count: number, gap: boolean): Line[] {
  const heading = (
    <Box key={level} justifyContent="space-between">
      <Text color={LEVEL_STYLE[level].color} bold>
        {LEVEL_STYLE[level].group}
      </Text>
      <Text dimColor>{count}</Text>
    </Box>
  );
  return [
    ...(gap ? [{ selected: false, element: <Text key={`${level}-gap`}> </Text> }] : []),
    { selected: false, element: heading },
  ];
}

function itemLines(transcript: Transcript, selected: boolean): Line[] {
  const { email, item, decision } = transcript;
  return [
    <Text key={`${item!.id}-subject`} wrap="truncate-end" bold={selected}>
      <Pointer selected={selected} />
      <LevelDot level={decision.level} /> {email.subject}
    </Text>,
    <Text key={`${item!.id}-from`} wrap="truncate-end" dimColor>
      {"    "}
      {email.from}
    </Text>,
    <Text key={`${item!.id}-want`} wrap="truncate-end" dimColor>
      {"    "}
      {whatIWant(transcript)}
    </Text>,
  ].map((element) => ({ element, selected }));
}
