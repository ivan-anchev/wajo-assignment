import { useInput } from "ink";
import { useState } from "react";

export function useCursor(count: number, active: boolean): number {
  const [cursor, setCursor] = useState(0);
  const at = clamp(cursor, count);

  useInput(
    (input, key) => {
      if (key.upArrow || input === "k") {
        setCursor(clamp(at - 1, count));
      } else if (key.downArrow || input === "j") {
        setCursor(clamp(at + 1, count));
      }
    },
    { isActive: active },
  );

  return at;
}

function clamp(cursor: number, count: number): number {
  return Math.max(Math.min(cursor, count - 1), 0);
}
