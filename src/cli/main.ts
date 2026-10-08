import { Command } from "commander";
import { existsSync } from "node:fs";
import { ACTIONS } from "../domain/actions.ts";
import { createAgent } from "../agent/agent.ts";
import { openDb } from "../db/open-db.ts";
import { DEFAULT_MODEL, languageModelFrom } from "../llm/llm.ts";
import { renderDecisionLine, renderTranscript } from "./render.ts";

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

const program = new Command("agent")
  .description("Inbox agent: learns when to act, notify, ask, or escalate")
  .addHelpText(
    "after",
    `\nActions:\n${ACTIONS.map((a) => `  ${a.name} (${a.riskClass})`).join("\n")}`,
  );

program
  .command("run")
  .description("Process every new email in the inbox and print one decision per email")
  .option(
    "--live",
    "call the real model for requests with no recorded fixture, and record them",
    false,
  )
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

await program.parseAsync();
