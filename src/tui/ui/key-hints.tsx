import { Box, Text } from "ink";

export function KeyHints({
  keys,
  extra,
}: {
  keys: { key: string; label: string }[];
  extra: string;
}) {
  return (
    <Box gap={2} flexShrink={0}>
      {keys.map(({ key, label }) => (
        <Box key={key} flexShrink={0}>
          <Text>
            <Text inverse> {key} </Text> {label}
          </Text>
        </Box>
      ))}
      <Text dimColor wrap="truncate-end">
        {extra}
      </Text>
    </Box>
  );
}
