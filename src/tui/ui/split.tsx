import { Box } from "ink";
import type { ReactNode } from "react";

export type Show = "both" | "left" | "right";

export function Split({
  height,
  leftWidth,
  show = "both",
  left,
  right,
}: {
  height: number;
  leftWidth: string;
  show?: Show;
  left: ReactNode;
  right: ReactNode;
}) {
  const both = show === "both";
  return (
    <Box height={height} flexShrink={0}>
      <Box
        display={show === "right" ? "none" : "flex"}
        width={both ? leftWidth : "100%"}
        flexShrink={0}
        flexDirection="column"
        paddingRight={both ? 1 : 0}
        borderStyle="single"
        borderTop={false}
        borderBottom={false}
        borderLeft={false}
        borderRight={both}
        borderColor="gray"
      >
        {left}
      </Box>
      <Box
        display={show === "left" ? "none" : "flex"}
        flexGrow={1}
        flexDirection="column"
        paddingLeft={both ? 1 : 0}
        overflow="hidden"
      >
        {right}
      </Box>
    </Box>
  );
}
