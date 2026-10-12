import type { LanguageModel } from "ai";
import { Agent } from "../agent/agent.ts";
import { Learner } from "../agent/learner.ts";
import { PreferenceMemory } from "../agent/preferences.ts";
import type { Reads } from "../db/reads.ts";
import type { Store } from "../db/store.ts";
import { Buckets } from "./buckets.ts";
import { Intake } from "./intake.ts";
import { Responses } from "./responses.ts";

export class App {
  readonly intake: Intake;
  readonly responses: Responses;
  readonly buckets: Buckets;
  readonly reads: Reads;

  constructor({ store, model }: { store: Store; model: LanguageModel }) {
    const learner = new Learner({ feedback: store.feedback, pins: store.pins });
    const agent = new Agent({ model, learner, memory: new PreferenceMemory(store.preferences) });

    this.intake = new Intake({ store, agent });
    this.responses = new Responses({ store, agent });
    this.buckets = new Buckets({ pins: store.pins, learner });
    this.reads = store.reads;
  }
}
