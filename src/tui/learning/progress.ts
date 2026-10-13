import type { BucketStanding } from "../../app/buckets.ts";
import type { Transcript } from "../../db/reads.ts";
import { actionFor } from "../../domain/actions.ts";
import { STREAK_TO_PROMOTE } from "../../domain/policy.ts";
import { LEVEL_STYLE } from "../levels.tsx";

export function bucketAnswers(history: Transcript[], { action, senderClass }: BucketStanding) {
  return history.filter(
    ({ feedback }) => feedback?.action === action && feedback.senderClass === senderClass,
  );
}

export function correctionCount(history: Transcript[], standing: BucketStanding): number {
  return bucketAnswers(history, standing).filter(({ feedback }) => feedback!.kind === "redirect")
    .length;
}

export function bucketNote(standing: BucketStanding, history: Transcript[]): string {
  const corrected = correctionCount(history, standing);
  return corrected ? `${progressNote(standing)} · corrected ${corrected}×` : progressNote(standing);
}

export function progressNote(standing: BucketStanding): string {
  const { action, floor, learned, streak, level } = standing;
  const left = STREAK_TO_PROMOTE - streak;
  switch (holder(standing)) {
    case "floor":
      return `safety floor: ${actionFor(action).riskClass}, always ${floor === "ask" ? "asks" : "escalates"}`;
    case "pin":
      return `pinned by you: ${LEVEL_STYLE[level].label}`;
    case "learning":
      if (learned === "ask") {
        return `${left} more approval${left === 1 ? "" : "s"} → act and notify`;
      }
      return learned === "notify"
        ? `${left} more "looks right" → handled quietly`
        : "trusted: handled quietly";
  }
}

export function progressPips(standing: BucketStanding): string | null {
  return holder(standing) === "learning" && standing.learned !== "silent"
    ? "●".repeat(standing.streak) + "○".repeat(STREAK_TO_PROMOTE - standing.streak)
    : null;
}

function holder({ floor, pin, learned, level }: BucketStanding): "floor" | "pin" | "learning" {
  if (floor === level && floor !== "silent") {
    return "floor";
  }
  return pin === level && learned !== level ? "pin" : "learning";
}
