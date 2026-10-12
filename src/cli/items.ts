import { InvalidArgumentError, type Command } from "commander";
import type { Agent, ResponseResult } from "../agent/agent.ts";
import type { ProposalEdit } from "../domain/actions.ts";
import { liveOption, positiveInteger, type OpenAgent } from "./options.ts";
import { renderResponse } from "./render.ts";

const SET_HELP =
  "param to change, repeatable; action=<name> switches the action. Values parse as JSON when they can; quote to keep text, e.g. label='\"2024\"'";

type ItemOptions = { set: ProposalEdit; reason?: string; live?: boolean };

type Respond = (
  agent: Agent,
  itemId: number,
  options: ItemOptions,
) => ResponseResult | Promise<ResponseResult>;

export function addItemCommands(program: Command, openAgent: OpenAgent): void {
  const itemCommand = (name: string, description: string, respond: Respond): Command =>
    program
      .command(name)
      .description(description)
      .argument("<itemId>", "item id from `agent inbox`", positiveInteger("an item id such as 3"))
      .action(async (itemId: number, options: ItemOptions) => {
        const agent = openAgent({ live: options.live ?? false });
        console.log(renderResponse(await respond(agent, itemId, options)));
      });

  itemCommand("approve", "Execute an ask's proposal (the floor is re-checked first)", (agent, id) =>
    agent.approve(id),
  );
  itemCommand("edit", "Change an ask's proposal, then approve it", (agent, id, { set }) =>
    agent.edit(id, set),
  )
    .requiredOption("--set <key=value>", SET_HELP, collectPair)
    .addOption(liveOption());
  itemCommand(
    "reject",
    "Close an ask without executing it; a reason may teach the agent a preference",
    (agent, id, { reason }) => agent.reject(id, reason),
  )
    .option("--reason <text>", "why you rejected it; one preference line may be learned from it")
    .addOption(liveOption());
  itemCommand("undo", "Revert a notified action", (agent, id) => agent.undo(id));
  itemCommand("dismiss", "Mark a notification or escalation as reviewed", (agent, id) =>
    agent.dismiss(id),
  );

  program
    .command("correct")
    .argument(
      "<decisionId>",
      "decision id from `agent log`",
      positiveInteger("a decision id such as 7"),
    )
    .description(
      "Say what a silent or notified decision should have done: undoes its action and teaches, never executes",
    )
    .requiredOption("--set <key=value>", SET_HELP, collectPair)
    .addOption(liveOption())
    .action(async (decisionId: number, { set, live }: ItemOptions) => {
      const agent = openAgent({ live: live ?? false });
      console.log(renderResponse(await agent.correct(decisionId, set)));
    });
}

function collectPair(pair: string, edit: ProposalEdit = {}): ProposalEdit {
  const at = pair.indexOf("=");
  if (at < 1) {
    throw new InvalidArgumentError(`expected key=value, got "${pair}"`);
  }
  return { ...edit, [pair.slice(0, at)]: parsedValue(pair.slice(at + 1)) };
}

// `amount=120` must reach the registry schema as a number; `to=a@b.dev` stays text.
function parsedValue(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
