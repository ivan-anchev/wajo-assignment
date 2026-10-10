import { Argument, Command, InvalidArgumentError, Option } from "commander";
import { existsSync } from "node:fs";
import { ACTIONS, type ActionName } from "../domain/actions.ts";
import {
  LEVELS,
  SENDER_CLASSES,
  type Level,
  type ProposalEdit,
  type ResponseResult,
  type SenderClass,
} from "../domain/types.ts";
import { evaluate } from "../../eval/eval.ts";
import { createAgent, Refusal, type Agent } from "../agent/agent.ts";
import { openDb } from "../db/open-db.ts";
import { DEFAULT_MODEL, languageModelFrom } from "../llm/llm.ts";
import {
  renderDecisionLine,
  renderInboxLine,
  renderResponse,
  renderStanding,
  renderTranscript,
} from "./render.ts";

if (existsSync(".env")) {
  process.loadEnvFile();
}

const config = {
  dbPath: process.env.AGENT_DB ?? "agent.db",
  inboxDir: process.env.INBOX_DIR ?? "fixtures/inbox",
  contactsPath: process.env.CONTACTS ?? "fixtures/contacts.json",
  model: process.env.MODEL ?? DEFAULT_MODEL,
};

function openAgent({ live }: { live: boolean }) {
  return createAgent(openDb(config.dbPath), languageModelFrom(config.model, { live }));
}

function liveOption(): Option {
  return new Option(
    "--live",
    "call the real model for requests with no recorded fixture, and record them",
  ).default(false);
}

const program = new Command("agent")
  .description("Inbox agent: learns when to act, notify, ask, or escalate")
  .addHelpText("after", `\nActions:\n${ACTIONS.map((a) => `  ${describeAction(a)}`).join("\n")}`);

program
  .command("run")
  .description("Process every new email in the inbox and print one decision per email")
  .addOption(liveOption())
  .action(async ({ live }: { live: boolean }) => {
    const transcripts = await openAgent({ live }).run({
      inboxDir: config.inboxDir,
      contactsPath: config.contactsPath,
    });
    console.log(
      transcripts.length ? transcripts.map(renderDecisionLine).join("\n") : "No new emails.",
    );
  });

program
  .command("transcript")
  .argument("<emailId>", "id of a processed email")
  .description("Show the decision chain for one email")
  .action((emailId: string) => {
    const transcript = openAgent({ live: false }).transcript(emailId);
    if (!transcript) {
      console.error(`No transcript for email "${emailId}".`);
      process.exitCode = 1;
      return;
    }
    console.log(renderTranscript(transcript));
  });

program
  .command("inbox")
  .description("List open asks, notifications, and escalations with the responses each takes")
  .action(() => {
    const transcripts = openAgent({ live: false }).inbox();
    console.log(
      transcripts.length ? transcripts.map(renderInboxLine).join("\n") : "Inbox is empty.",
    );
  });

itemCommand("approve", "Execute an ask's proposal (the floor is re-checked first)", (agent, id) =>
  agent.approve(id),
);
itemCommand("edit", "Change an ask's proposal, then approve it", (agent, id, { set }) =>
  agent.edit(id, set),
)
  .requiredOption(
    "--set <key=value>",
    "param to change, repeatable; action=<name> switches the action",
    collectPair,
  )
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
  .command("log")
  .description("List the most recent decisions, silent ones included, oldest first")
  .option("--limit <n>", "how many decisions to list", positiveInteger("a count such as 20"), 20)
  .action(({ limit }: { limit: number }) => {
    const transcripts = openAgent({ live: false }).log(limit);
    console.log(
      transcripts.length ? transcripts.map(renderDecisionLine).join("\n") : "No decisions yet.",
    );
  });

program
  .command("revert")
  .argument(
    "<decisionId>",
    "decision id from `agent log`",
    positiveInteger("a decision id such as 7"),
  )
  .description("Revert a silent action and step its bucket back to notify")
  .action((decisionId: number) => {
    console.log(renderResponse(openAgent({ live: false }).revert(decisionId)));
  });

program
  .command("prefs")
  .description("Print the preference lines learned from edits and reject reasons")
  .action(() => {
    console.log(openAgent({ live: false }).prefs() || "No preferences learned yet.");
  });

const actionArg = new Argument("<action>").choices(ACTIONS.map((a) => a.name));
const senderClassArg = new Argument("<senderClass>").choices(SENDER_CLASSES);
const levelArg = new Argument("<level>").choices(LEVELS);

program
  .command("pin")
  .description("Hold an action/sender-class bucket at a level or stricter")
  .addArgument(actionArg)
  .addArgument(senderClassArg)
  .addArgument(levelArg)
  .action((action: ActionName, senderClass: SenderClass, level: Level) => {
    console.log(renderStanding(openAgent({ live: false }).pin(action, senderClass, level)));
  });

program
  .command("unpin")
  .description("Remove a bucket's pin and report the level it falls back to")
  .addArgument(actionArg)
  .addArgument(senderClassArg)
  .action((action: ActionName, senderClass: SenderClass) => {
    console.log(renderStanding(openAgent({ live: false }).unpin(action, senderClass)));
  });

program
  .command("eval")
  .description(
    "Play every scenario with a scripted user; write RESULTS.md, results.json and transcripts/",
  )
  .option(
    "--episodes <n>",
    "episodes to run after the baseline, with learned state carried over",
    positiveInteger("a count such as 5"),
    5,
  )
  .addOption(liveOption())
  .action(async ({ live, episodes }: { live: boolean; episodes: number }) => {
    const { report, passed } = await evaluate(languageModelFrom(config.model, { live }), {
      episodes,
      model: config.model,
    });
    console.log(report);
    if (!passed) {
      process.exitCode = 1;
    }
  });

type ItemOptions = { set: ProposalEdit; reason?: string; live?: boolean };

function itemCommand(
  name: string,
  description: string,
  respond: (
    agent: Agent,
    itemId: number,
    options: ItemOptions,
  ) => ResponseResult | Promise<ResponseResult>,
): Command {
  return program
    .command(name)
    .description(description)
    .argument("<itemId>", "item id from `agent inbox`", positiveInteger("an item id such as 3"))
    .action(async (itemId: number, options: ItemOptions) => {
      const agent = openAgent({ live: options.live ?? false });
      console.log(renderResponse(await respond(agent, itemId, options)));
    });
}

function positiveInteger(example: string): (value: string) => number {
  return (value) => {
    if (!/^[1-9]\d*$/.test(value)) {
      throw new InvalidArgumentError(`expected ${example}`);
    }
    return Number(value);
  };
}

function describeAction({ name, riskClass, params }: (typeof ACTIONS)[number]): string {
  const keys = Object.keys(params.shape).join(", ");
  return [name, `(${riskClass})`, keys].filter(Boolean).join(" ");
}

function collectPair(pair: string, edit: ProposalEdit = {}): ProposalEdit {
  const at = pair.indexOf("=");
  if (at < 1) {
    throw new InvalidArgumentError(`expected key=value, got "${pair}"`);
  }
  return { ...edit, [pair.slice(0, at)]: pair.slice(at + 1) };
}

try {
  await program.parseAsync();
} catch (error) {
  if (!(error instanceof Refusal)) {
    throw error;
  }
  console.error(error.message);
  process.exitCode = 1;
}
