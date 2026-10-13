import { render } from "ink";
import { existsSync, mkdirSync } from "node:fs";
import { App } from "../app/app.ts";
import { Store } from "../db/store.ts";
import { emptyInbox, type InboxSource } from "../inbox/inbox.ts";
import { DEFAULT_MODEL, languageModelFrom, providerModel } from "../llm/llm.ts";
import { Shell } from "./shell/shell.tsx";

if (existsSync(".env")) {
  process.loadEnvFile();
}

const live = process.argv.includes("--live");
const spec = process.env.MODEL || DEFAULT_MODEL;
const store = Store.open(process.env.AGENT_DB ?? "agent.db");
const app = new App({
  store,
  model: live ? providerModel(spec) : languageModelFrom(spec, { live: false }),
});

const inbox: InboxSource = { inboxDir: "inbox", contactsPath: "fixtures/contacts.json" };
mkdirSync(inbox.inboxDir, { recursive: true });

function coldStart() {
  emptyInbox(inbox.inboxDir);
  store.reset();
}

render(
  <Shell
    app={app}
    inbox={inbox}
    mailDir={process.env.INBOX_DIR || "scenarios"}
    live={live}
    coldStart={coldStart}
  />,
);
