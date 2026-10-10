import type { Agent } from "../src/agent/agent.ts";
import type { Item, ResponseResult } from "../src/domain/types.ts";
import type { Scenario } from "../src/scenarios/scenarios.ts";

export async function answer(
  agent: Agent,
  scenario: Scenario,
  item: Item,
): Promise<ResponseResult> {
  switch (item.kind) {
    case "ask":
      return answerAsk(agent, item.id, scenario.onAsk);
    case "notify":
      return scenario.onNotify === "undo" ? agent.undo(item.id) : agent.dismiss(item.id);
    case "escalate":
      return agent.dismiss(item.id);
  }
}

async function answerAsk(
  agent: Agent,
  itemId: number,
  onAsk: Scenario["onAsk"],
): Promise<ResponseResult> {
  if (onAsk === "approve") {
    return agent.approve(itemId);
  }
  if (onAsk === "reject") {
    return agent.reject(itemId);
  }
  return "edit" in onAsk ? agent.edit(itemId, onAsk.edit) : agent.reject(itemId, onAsk.reject);
}
