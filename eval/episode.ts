import type { LanguageModel } from "ai";
import { fileURLToPath } from "node:url";
import { createAgent, type Agent } from "../src/agent/agent.ts";
import { Store, type Transcript } from "../src/db/store.ts";
import { byArrival, writeInbox } from "../src/inbox/inbox.ts";
import type { Scenario } from "./scenarios.ts";
import { answer } from "./oracle.ts";

export type Outcome = { scenario: Scenario; transcript: Transcript };
export type Episode = Outcome[];
export type Run = { baseline: Episode; episodes: Episode[]; preferences: string };
export type LabelledEpisode = { label: string; episode: Episode };

const CONTACTS = fileURLToPath(new URL("../fixtures/contacts.json", import.meta.url));
const BASELINE = "baseline";

export async function runEpisodes(
  llm: LanguageModel,
  scenarios: readonly Scenario[],
  count: number,
): Promise<Run> {
  const baseline = await runBaseline(llm, scenarios);
  const agent = createAgent(Store.open(":memory:"), llm);
  const episodes: Episode[] = [];
  for (let n = 1; n <= count; n++) {
    episodes.push(await runEpisode(agent, scenarios, `e${n}`));
  }
  return { baseline, episodes, preferences: agent.prefs() };
}

export function labelledEpisodes({ baseline, episodes }: Run): LabelledEpisode[] {
  return [
    { label: BASELINE, episode: baseline },
    ...episodes.map((episode, at) => ({ label: `${at + 1}`, episode })),
  ];
}

export function outcomesIn(episode: Episode, split: Scenario["split"]): Episode {
  return episode.filter(({ scenario }) => scenario.split === split);
}

// Decides every scenario of both splits on a fresh database and answers nothing, so nothing is learned.
async function runBaseline(llm: LanguageModel, scenarios: readonly Scenario[]): Promise<Episode> {
  const agent = createAgent(Store.open(":memory:"), llm);
  await agent.run(writeInbox(emailsOf(scenarios, BASELINE), CONTACTS));
  return outcomesOf(agent, scenarios, BASELINE);
}

// Prequential on train: each email is decided, then answered, before the next one arrives.
// The held-out test emails are then decided on what train taught and never answered.
async function runEpisode(
  agent: Agent,
  scenarios: readonly Scenario[],
  tag: string,
): Promise<Episode> {
  for (const scenario of scenariosIn(scenarios, "train").toSorted(byArrival)) {
    await deliverAndAnswer(agent, scenario, tag);
  }
  await agent.run(writeInbox(emailsOf(scenariosIn(scenarios, "test"), tag), CONTACTS));
  return outcomesOf(agent, scenarios, tag);
}

async function deliverAndAnswer(agent: Agent, scenario: Scenario, tag: string): Promise<void> {
  const { item } = (await agent.run(writeInbox(emailsOf([scenario], tag), CONTACTS)))[0]!;
  if (item) {
    await answer(agent, scenario, item);
  }
}

function outcomesOf(agent: Agent, scenarios: readonly Scenario[], tag: string): Episode {
  return scenarios.map((scenario) => ({
    scenario,
    transcript: agent.transcript(emailIdOf(scenario, tag))!,
  }));
}

function scenariosIn(scenarios: readonly Scenario[], split: Scenario["split"]): Scenario[] {
  return scenarios.filter((scenario) => scenario.split === split);
}

function emailsOf(scenarios: readonly Scenario[], tag: string) {
  return scenarios.map((scenario) => ({ ...scenario, id: emailIdOf(scenario, tag) }));
}

function emailIdOf(scenario: Scenario, tag: string): string {
  return `${scenario.id}@${tag}`;
}
