import { Command } from "commander";
import { existsSync } from "node:fs";
import { ACTIONS } from "../domain/actions.ts";
import { evaluate } from "../../eval/eval.ts";
import { Agent, Refusal } from "../agent/agent.ts";
import { Store } from "../db/store.ts";
import { DEFAULT_MODEL, languageModelFrom } from "../llm/llm.ts";
import { addItemCommands } from "./items.ts";
import { liveOption, positiveInteger, type OpenAgent } from "./options.ts";
import { addPinCommands } from "./pins.ts";
import { renderDecisionLine, renderInboxLine, renderTranscript } from "./render.ts";

if (existsSync(".env")) {
  process.loadEnvFile();
}

const config = {
  dbPath: process.env.AGENT_DB ?? "agent.db",
  inboxDir: process.env.INBOX_DIR ?? "fixtures/inbox",
  contactsPath: process.env.CONTACTS ?? "fixtures/contacts.json",
  model: process.env.MODEL ?? DEFAULT_MODEL,
};

const openAgent: OpenAgent = ({ live }) =>
  new Agent({ store: Store.open(config.dbPath), model: languageModelFrom(config.model, { live }) });

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

addItemCommands(program, openAgent);

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
  .command("prefs")
  .description("Print the preference lines learned from edits and reject reasons")
  .action(() => {
    console.log(openAgent({ live: false }).prefs() || "No preferences learned yet.");
  });

addPinCommands(program, openAgent);

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

function describeAction({ name, riskClass, params }: (typeof ACTIONS)[number]): string {
  const keys = Object.keys(params.shape).join(", ");
  return [name, `(${riskClass})`, keys].filter(Boolean).join(" ");
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
