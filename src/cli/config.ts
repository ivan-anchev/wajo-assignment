export type CliConfig = { dbPath: string; inboxDir: string; contactsPath: string; model: string };

export function readConfig(env: NodeJS.ProcessEnv): CliConfig {
  return {
    dbPath: env.AGENT_DB ?? "agent.db",
    inboxDir: env.INBOX_DIR ?? "fixtures/inbox",
    contactsPath: env.CONTACTS ?? "fixtures/contacts.json",
    model: env.MODEL ?? "anthropic:claude-opus-5-5",
  };
}
