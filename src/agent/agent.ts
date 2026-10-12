import type { LanguageModel } from "ai";
import type { NewDecision } from "../db/decisions.ts";
import type { Transcript } from "../db/reads.ts";
import { levelFor, type FeedbackKind, type Level } from "../domain/policy.ts";
import type { Email } from "../inbox/inbox.ts";
import { analyze } from "./analyze.ts";
import { checkInjection } from "./check-injection.ts";
import { checkPayment } from "./check-payment.ts";
import type { Learner } from "./learner.ts";
import { extractPreferences, type Correction, type PreferenceMemory } from "./preferences.ts";

export type Event = { kind: "incoming_email"; email: Email };

export type Teaching = { feedback: FeedbackKind; preferences: string[] | null };

export type Learned = { promotion: Level | null; preference: string | null };

export class Agent {
  private readonly model: LanguageModel;
  private readonly learner: Learner;
  private readonly memory: PreferenceMemory;

  constructor(parts: { model: LanguageModel; learner: Learner; memory: PreferenceMemory }) {
    this.model = parts.model;
    this.learner = parts.learner;
    this.memory = parts.memory;
  }

  async decide(event: Event): Promise<NewDecision> {
    const { email } = event;
    const injection = await checkInjection(this.model, email);
    const payment = checkPayment(email);
    const analysis = injection.suspected
      ? null
      : await analyze(this.model, email, this.memory.text());
    const action = analysis?.proposal.action;
    const { history, pin } = action
      ? this.learner.bucket(action, email.senderClass)
      : { history: [], pin: null };

    return {
      emailId: email.id,
      analysis,
      injection,
      payment,
      pin,
      ...levelFor(analysis, [injection, payment], history, pin),
    };
  }

  reflect(answered: Transcript, correction: Correction): Promise<string[]> {
    return extractPreferences(this.model, answered, correction, this.memory.text());
  }

  learn(answered: Transcript, { feedback, preferences }: Teaching): Learned {
    return {
      promotion: this.learner.record(answered, feedback),
      preference: preferences && this.memory.note(preferences),
    };
  }
}
