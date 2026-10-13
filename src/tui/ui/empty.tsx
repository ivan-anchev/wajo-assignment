import { Box, Text } from "ink";

export function Empty({ height, title, hint }: { height: number; title: string; hint: string }) {
  return (
    <Box height={height} flexDirection="column" justifyContent="center" alignItems="center">
      <Text bold>{title}</Text>
      <Text dimColor>{hint}</Text>
    </Box>
  );
}
