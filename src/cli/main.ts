import { Command } from "commander";
import { ACTIONS } from "../domain/actions.ts";
import { createAgent } from "../agent/agent.ts";
import { openDb } from "../db/open-db.ts";
import { languageModelFrom } from "../llm/llm.ts";
import { renderDecisionLine, renderTranscript } from "./render.ts";

const config = {
  dbPath: process.env.AGENT_DB ?? "agent.db",
  inboxDir: process.env.INBOX_DIR ?? "fixtures/inbox",
  contactsPath: process.env.CONTACTS ?? "fixtures/contacts.json",
  model: process.env.MODEL ?? "anthropic:claude-opus-5-5",
};
const agent = createAgent(openDb(config.dbPath), languageModelFrom(config.model));

const program = new Command("agent")
  .description("Inbox agent: learns when to act, notify, ask, or escalate")
  .addHelpText(
    "after",
    `\nActions:\n${ACTIONS.map((a) => `  ${a.name} (${a.riskClass})`).join("\n")}`,
  );

program
  .command("run")
  .description("Process every new email in the inbox and print one decision per email")
  .action(async () => {
    const transcripts = await agent.run({
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
    const transcript = agent.transcript(emailId);
    if (!transcript) {
      console.error(`No transcript for email "${emailId}".`);
      process.exitCode = 1;
      return;
    }
    console.log(renderTranscript(transcript));
  });

await program.parseAsync();
