import type { ItemKind } from "./level.model.ts";

export type ItemResponse = "approve" | "edit" | "reject" | "dismiss" | "undo";

const ALLOWED_RESPONSES: Record<ItemKind, readonly ItemResponse[]> = {
  ask: ["approve", "edit", "reject"],
  notify: ["dismiss", "undo"],
  escalate: ["dismiss"],
};

export function allowedResponses(kind: ItemKind): readonly ItemResponse[] {
  return ALLOWED_RESPONSES[kind];
}
