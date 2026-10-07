import type { LanguageModel } from "ai";
import type { InboxSource } from "./mail/index.ts";
import { intake, processEvent, type Transcript } from "./pipeline/index.ts";
import { findTranscript, type Db } from "./store/index.ts";

export function createAgent(db: Db, llm: LanguageModel) {
  return {
    async run(source: InboxSource): Promise<Transcript[]> {
      const transcripts: Transcript[] = [];
      for (const event of intake(db, source)) {
        transcripts.push(await processEvent(db, llm, event));
      }
      return transcripts;
    },

    transcript(emailId: string): Transcript | null {
      return findTranscript(db, emailId);
    },
  };
}

export type Agent = ReturnType<typeof createAgent>;
export type { Transcript } from "./pipeline/index.ts";
