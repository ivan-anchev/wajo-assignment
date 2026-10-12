import { Command } from "commander";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { ACTIONS } from "../domain/actions.ts";
import { evaluate } from "../../eval/eval.ts";
import { App } from "../app/app.ts";
import { Refusal } from "../app/refusal.ts";
import { Store } from "../db/store.ts";
import type { InboxSource } from "../inbox/inbox.ts";
import { DEFAULT_MODEL, languageModelFrom } from "../llm/llm.ts";
import { addItemCommands } from "./items.ts";
import { liveOption, positiveInteger, type OpenApp } from "./options.ts";
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

const openApp: OpenApp = ({ live }) =>
  new App({ store: Store.open(config.dbPath), model: languageModelFrom(config.model, { live }) });

const inbox: InboxSource = { inboxDir: config.inboxDir, contactsPath: config.contactsPath };

const program = new Command("agent")
  .description("Inbox agent: learns when to act, notify, ask, or escalate")
  .addHelpText("after", `\nActions:\n${ACTIONS.map((a) => `  ${describeAction(a)}`).join("\n")}`);

program
  .command("run")
  .description("Process every new email in the inbox and print one decision per email")
  .addOption(liveOption())
  .action(async ({ live }: { live: boolean }) => {
    const transcripts = await openApp({ live }).intake.run(inbox);
    console.log(
      transcripts.length ? transcripts.map(renderDecisionLine).join("\n") : "No new emails.",
    );
  });

program
  .command("watch")
  .description("Keep running and process new emails as they arrive in the inbox")
  .option(
    "--every <seconds>",
    "seconds between inbox checks",
    positiveInteger("a count such as 5"),
    5,
  )
  .addOption(liveOption())
  .action(async ({ every, live }: { every: number; live: boolean }) => {
    const { intake } = openApp({ live });
    for (;;) {
      const transcripts = await intake.run(inbox);
      if (transcripts.length) {
        console.log(transcripts.map(renderDecisionLine).join("\n"));
      }
      await sleep(every * 1000);
    }
  });

program
  .command("transcript")
  .argument("<emailId>", "id of a processed email")
  .description("Show the decision chain for one email")
  .action((emailId: string) => {
    const transcript = openApp({ live: false }).reads.findTranscript(emailId);
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
    const transcripts = openApp({ live: false }).reads.openTranscripts();
    console.log(
      transcripts.length ? transcripts.map(renderInboxLine).join("\n") : "Inbox is empty.",
    );
  });

addItemCommands(program, openApp);

program
  .command("log")
  .description("List the most recent decisions, silent ones included, oldest first")
  .option("--limit <n>", "how many decisions to list", positiveInteger("a count such as 20"), 20)
  .action(({ limit }: { limit: number }) => {
    const transcripts = openApp({ live: false }).reads.recentTranscripts(limit);
    console.log(
      transcripts.length ? transcripts.map(renderDecisionLine).join("\n") : "No decisions yet.",
    );
  });

program
  .command("prefs")
  .description("Print the preference lines learned from edits and reject reasons")
  .action(() => {
    console.log(openApp({ live: false }).reads.preferences() || "No preferences learned yet.");
  });

addPinCommands(program, openApp);

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
