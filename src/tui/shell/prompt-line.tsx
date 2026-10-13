import { Text, useInput } from "ink";
import { useState } from "react";
import type { Prompt } from "../view-context.ts";

export function PromptLine({ prompt, close }: { prompt: Prompt; close: () => void }) {
  return prompt.kind === "text" ? (
    <TextPrompt prompt={prompt} close={close} />
  ) : (
    <ChoicePrompt prompt={prompt} close={close} />
  );
}

function TextPrompt({
  prompt,
  close,
}: {
  prompt: Extract<Prompt, { kind: "text" }>;
  close: () => void;
}) {
  const [text, setText] = useState("");

  useInput((input, key) => {
    if (key.return) {
      close();
      prompt.submit(text.trim());
    } else if (key.escape) {
      close();
    } else if (key.backspace || key.delete) {
      setText((typed) => typed.slice(0, -1));
    } else if (!key.ctrl && !key.meta) {
      setText((typed) => typed + input);
    }
  });

  return (
    <Text wrap="truncate-start">
      <Text color="cyan">{prompt.label} › </Text>
      {text}
      <Text inverse> </Text>
      <Text dimColor> enter save · esc cancel</Text>
    </Text>
  );
}

function ChoicePrompt({
  prompt,
  close,
}: {
  prompt: Extract<Prompt, { kind: "choice" }>;
  close: () => void;
}) {
  const [at, setAt] = useState(0);

  useInput((_, key) => {
    if (key.leftArrow) {
      setAt((index) => Math.max(index - 1, 0));
    } else if (key.rightArrow || key.tab) {
      setAt((index) => Math.min(index + 1, prompt.options.length - 1));
    } else if (key.return) {
      close();
      prompt.choose(prompt.options[at]!.value);
    } else if (key.escape) {
      close();
    }
  });

  return (
    <Text wrap="truncate-end">
      <Text color="cyan">{prompt.label} </Text>
      {prompt.options.map((option, index) => (
        <Text key={option.value} inverse={index === at}>
          {" "}
          {option.label}{" "}
        </Text>
      ))}
      <Text dimColor> ←/→ · enter · esc</Text>
    </Text>
  );
}
