import { Box, Text } from "ink";
import type { ReactNode } from "react";

export function Pane({
  title,
  focused,
  shown,
  height,
  children,
}: {
  title: string;
  focused: boolean;
  shown: boolean;
  height: number;
  children: ReactNode;
}) {
  return (
    <Box
      display={shown ? "flex" : "none"}
      flexDirection="column"
      height={height}
      flexShrink={0}
      overflow="hidden"
    >
      <Text
        bold
        inverse={focused}
        color={focused ? "cyan" : "gray"}
        wrap="truncate-end"
      >{` ${title} `}</Text>
      {children}
    </Box>
  );
}
