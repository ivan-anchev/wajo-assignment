import { Box, Text } from "ink";
import type { Notice } from "../notice.ts";
import type { Prompt } from "../view-context.ts";
import { PromptLine } from "./prompt-line.tsx";

export function Footer({
  prompt,
  closePrompt,
  notice,
  help,
}: {
  prompt: Prompt | null;
  closePrompt: () => void;
  notice: Notice;
  help: string;
}) {
  if (prompt) {
    return (
      <Box
        borderStyle="round"
        borderColor="cyan"
        paddingX={1}
        height={3}
        marginTop={1}
        flexShrink={0}
      >
        <PromptLine key={prompt.label} prompt={prompt} close={closePrompt} />
      </Box>
    );
  }
  return (
    <Box flexDirection="column" height={3} marginTop={1} flexShrink={0}>
      <Box flexDirection="column" height={2}>
        {notice.lines.map((line) => (
          <Text key={line} color={notice.tone} wrap="truncate-end">
            {line}
          </Text>
        ))}
      </Box>
      <Text dimColor wrap="truncate-end">
        {help}
      </Text>
    </Box>
  );
}
