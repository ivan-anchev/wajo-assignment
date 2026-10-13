import { Box, Text } from "ink";

export function Preferences({ text }: { text: string }) {
  const lines = text ? text.split("\n") : [];
  return (
    <Box flexDirection="column" flexShrink={0} marginTop={1}>
      <Text bold>Preferences</Text>
      {lines.map((line, index) => (
        <Box key={line} flexShrink={0}>
          <Text>
            <Text color="magenta">{index + 1}. </Text>
            {line}
          </Text>
        </Box>
      ))}
      {!lines.length && (
        <Text dimColor>None yet. Reject with a reason (R) or correct (c in Activity).</Text>
      )}
    </Box>
  );
}
