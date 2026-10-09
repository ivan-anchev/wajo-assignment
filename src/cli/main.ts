import { Command, InvalidArgumentError } from "commander";
import { existsSync } from "node:fs";
import { ACTIONS } from "../domain/actions.ts";
import type { ProposalEdit, ResponseResult } from "../domain/types.ts";
import { createAgent, InvalidResponseError, type Agent } from "../agent/agent.ts";
import { openDb } from "../db/open-db.ts";
import { DEFAULT_MODEL, languageModelFrom } from "../llm/llm.ts";
import { renderDecisionLine, renderInboxLine, renderResponse, renderTranscript } from "./render.ts";

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
  .addHelpText("after", `\nActions:\n${ACTIONS.map((a) => `  ${describeAction(a)}`).join("\n")}`);

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
).requiredOption(
  "--set <key=value>",
  "param to change, repeatable; action=<name> switches the action",
  collectPair,
);
itemCommand("reject", "Close an ask without executing it", (agent, id) => agent.reject(id));
itemCommand("undo", "Revert a notified action", (agent, id) => agent.undo(id));
itemCommand("dismiss", "Mark a notification or escalation as reviewed", (agent, id) =>
  agent.dismiss(id),
);

function itemCommand(
  name: string,
  description: string,
  respond: (agent: Agent, itemId: number, options: { set: ProposalEdit }) => ResponseResult,
): Command {
  return program
    .command(name)
    .description(description)
    .argument("<itemId>", "item id from `agent inbox`", parseItemId)
    .action((itemId: number, options: { set: ProposalEdit }) => {
      try {
        console.log(renderResponse(respond(openAgent({ live: false }), itemId, options)));
      } catch (error) {
        if (!(error instanceof InvalidResponseError)) {
          throw error;
        }
        console.error(error.message);
        process.exitCode = 1;
      }
    });
}

function parseItemId(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new InvalidArgumentError("expected an item id such as 3");
  }
  return Number(value);
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

await program.parseAsync();
