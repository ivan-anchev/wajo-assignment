import type { LanguageModel } from "ai";
import { fileURLToPath } from "node:url";
import { createAgent, type Agent } from "../src/agent/agent.ts";
import { openDb } from "../src/db/open-db.ts";
import type { Transcript } from "../src/domain/types.ts";
import { writeInbox } from "../src/inbox/inbox.ts";
import type { Scenario } from "../src/scenarios/scenarios.ts";
import { answer } from "./oracle.ts";

export type Outcome = { scenario: Scenario; transcript: Transcript };
export type Episode = Outcome[];
export type Run = { episodes: Episode[]; preferences: string };

const CONTACTS = fileURLToPath(new URL("../fixtures/contacts.json", import.meta.url));

export async function runEpisodes(
  llm: LanguageModel,
  scenarios: readonly Scenario[],
  count: number,
): Promise<Run> {
  const agent = createAgent(openDb(":memory:"), llm);
  const episodes: Episode[] = [];
  for (let n = 1; n <= count; n++) {
    episodes.push(await runEpisode(agent, scenarios, n));
  }
  return { episodes, preferences: agent.prefs() };
}

async function runEpisode(
  agent: Agent,
  scenarios: readonly Scenario[],
  n: number,
): Promise<Episode> {
  const cast = new Map(scenarios.map((scenario) => [emailIdOf(scenario, n), scenario]));
  await agent.run(writeInbox(episodeEmails(scenarios, n), CONTACTS));
  await answerInbox(agent, cast);
  return scenarios.map((scenario) => ({
    scenario,
    transcript: agent.transcript(emailIdOf(scenario, n))!,
  }));
}

async function answerInbox(agent: Agent, cast: Map<string, Scenario>): Promise<void> {
  for (const { email, item } of agent.inbox()) {
    await answer(agent, cast.get(email.id)!, item!);
  }
}

function episodeEmails(scenarios: readonly Scenario[], n: number) {
  return scenarios.map((scenario) => ({ ...scenario, id: emailIdOf(scenario, n) }));
}

function emailIdOf(scenario: Scenario, n: number): string {
  return `${scenario.id}@e${n}`;
}
