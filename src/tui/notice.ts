import type { BucketStanding } from "../app/buckets.ts";
import type { ResponseResult } from "../app/responses.ts";
import type { Feedback } from "../db/feedback.ts";
import type { Transcript } from "../db/reads.ts";
import type { Level } from "../domain/policy.ts";
import type { EmailFile } from "../inbox/inbox.ts";
import { LEVEL_STYLE } from "./levels.tsx";
import { actionWords, bucketWords, outcomeWords, senderWords } from "./words.ts";

export type Notice = { tone: "green" | "red" | "cyan" | "magenta"; lines: string[] };

export function welcomeNotice(mailDir: string): Notice {
  return info(
    `Press n to deliver the next email from ${mailDir}/. Answer items to teach the agent.`,
  );
}

export function deliveredNotice(email: EmailFile | null, mailDir: string): Notice {
  return info(email ? `↓ Delivered: ${email.subject}` : `No more mail in ${mailDir}/ to deliver.`);
}

export function coldStartNotice(): Notice {
  return info("Cold start: nothing decided or learned. Press n to deliver the first email.");
}

export function arrivalNotice(decided: Transcript[]): Notice {
  return {
    tone: "cyan",
    lines: decided
      .slice(-2)
      .map(({ email, decision }) => `✉ ${email.subject} → ${LEVEL_STYLE[decision.level].label}`),
  };
}

export function answeredNotice(result: ResponseResult): Notice {
  const { email, feedback } = result.transcript;
  const promotion = result.promotion && promotionLine(feedback!, result.promotion);
  return {
    tone: promotion || result.preference ? "magenta" : "green",
    lines: [
      `✓ ${outcomeWords(result.transcript)}: ${email.subject}`,
      ...(promotion ? [`★ ${promotion}`] : []),
      ...preferenceLine(feedback, result.preference),
    ],
  };
}

export function pinNotice({ action, senderClass, pin, level }: BucketStanding): Notice {
  const bucket = bucketWords(action, senderClass);
  const now = LEVEL_STYLE[level].label;
  return {
    tone: "green",
    lines: [pin ? `Pinned ${bucket}: ${now}` : `Unpinned ${bucket}: now ${now}`],
  };
}

export function failureNotice(error: Error): Notice {
  const replayMiss = error.message.startsWith("No LLM fixture");
  return {
    tone: "red",
    lines: [replayMiss ? "This needs the model: restart with `pnpm tui --live`." : error.message],
  };
}

function info(line: string): Notice {
  return { tone: "cyan", lines: [line] };
}

function preferenceLine(feedback: Feedback | null, preference: string | null): string[] {
  if (preference) {
    return [`✎ Noted: ${preference}`];
  }
  return feedback?.kind === "redirect" || feedback?.kind === "edit"
    ? ["✎ No rule learned: it looked like a one-off."]
    : [];
}

function promotionLine({ action, senderClass }: Feedback, from: Level): string {
  const without = from === "ask" ? "asking" : "telling";
  const bucket = `${actionWords(action)} ${senderWords(senderClass)} mail`;
  return `Learned: ${bucket} now runs without ${without} you. Pin it in Learning (p) to keep it at ${LEVEL_STYLE[from].label}.`;
}
