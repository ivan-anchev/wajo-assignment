import type { ResponseResult } from "../agent/agent.ts";
import type { BucketStanding } from "../agent/learner.ts";
import type { Decision } from "../db/decisions.ts";
import type { Execution } from "../db/executions.ts";
import type { Feedback } from "../db/feedback.ts";
import type { Item } from "../db/items.ts";
import type { Transcript } from "../db/store.ts";
import type { Proposal } from "../domain/actions.ts";
import { proposalOf, requestOf, type Verdict } from "../domain/policy.ts";
import type { Email } from "../inbox/inbox.ts";

export function renderDecisionLine({ email, decision, item, executions }: Transcript): string {
  return [
    String(decision.id).padStart(4),
    email.id.padEnd(5),
    email.senderClass.padEnd(14),
    (decision.analysis ? decision.analysis.proposal.action : "(not analyzed)").padEnd(19),
    `floor=${decision.floor}`.padEnd(15),
    `level=${decision.level}`.padEnd(15),
    describeOutcome(item, executions),
  ].join(" ");
}

export function renderResponse({ transcript, promotion, preference }: ResponseResult): string {
  return [
    renderDecisionLine(transcript),
    ...(promotion ? [promotion] : []),
    ...(preference ? [`Noted preference: ${preference}`] : []),
  ].join("\n");
}

export function renderStanding({ action, senderClass, pin, level }: BucketStanding): string {
  const bucket = `${action}/${senderClass}`;
  const change = pin ? `Pinned ${bucket} at ${pin}` : `Unpinned ${bucket}`;
  return `${change}; the level is now ${level}.`;
}

export function renderInboxLine({ email, decision, item }: Transcript): string {
  const open = item!;
  return [
    `#${open.id}`.padEnd(5),
    open.kind.padEnd(9),
    email.from.padEnd(28),
    `"${email.subject}"`,
    decision.analysis ? `-> ${describeProposal(open.proposal)}` : notAnalyzed(decision.injection),
    `[${open.allowedResponses.join(", ")}]`,
    ...(open.kind === "notify" ? [`or correct ${decision.id} --set key=value`] : []),
  ].join("  ");
}

export function renderTranscript({
  email,
  decision,
  item,
  executions,
  feedback,
}: Transcript): string {
  const { analysis, injection } = decision;
  return [
    `Email ${email.id}: "${email.subject}"`,
    `  ${email.from} -> ${email.to}  received ${email.receivedAt}`,
    ``,
    `1 intake     sender class: ${email.senderClass}`,
    `2 injection  ${injection.suspected ? `SUSPECTED (${injection.evidence.join("; ")})` : "not suspected"}`,
    ...(analysis
      ? [
          `3 analyze    intent: ${analysis.intent}`,
          `             summary: ${analysis.summary}`,
          `             proposal: ${describeProposal(analysis.proposal)}`,
        ]
      : [`3 analyze    skipped: injection suspected`]),
    `4 floor      ${decision.floor} (${describeFloorCause(decision)})`,
    `5 learned    ${describeLearned(email, decision)}`,
    `6 level      ${decision.level}`,
    `7 act        ${describeOutcome(item, executions)}`,
    ...responseStep(item, feedback),
  ].join("\n");
}

function describeFloorCause({ analysis, injection, payment }: Decision): string {
  if (injection.suspected) {
    return "injection suspected";
  }
  if (payment.suspected) {
    return `payment suspected: ${payment.evidence.join("; ")}`;
  }
  return `proposed ${proposalOf(analysis).action}, requested ${requestOf(analysis)}`;
}

function describeLearned({ senderClass }: Email, { analysis, learned, pin }: Decision): string {
  if (!analysis) {
    return "skipped: injection suspected";
  }
  const pinned = pin ? `, pinned at ${pin}` : "";
  return `${learned} for ${analysis.proposal.action}/${senderClass}${pinned}`;
}

function notAnalyzed({ evidence }: Verdict): string {
  return `injection suspected; not analyzed (${evidence.join("; ")})`;
}

function describeOutcome(item: Item | null, executions: Execution[]): string {
  const executed = executions.map(
    (execution) => `executed ${execution.proposal.action}${execution.undoneAt ? " (undone)" : ""}`,
  );
  return [...executed, ...(item ? [describeItem(item)] : [])].join(", ");
}

function describeItem(item: Item): string {
  return item.status === "open"
    ? `opened ${item.kind} item #${item.id} [${item.allowedResponses.join(", ")}]`
    : `${item.kind} item #${item.id} ${item.status}`;
}

// A silent decision has no item; its only response is a correction, which writes feedback.
function responseStep(item: Item | null, feedback: Feedback | null): string[] {
  if (item && item.status !== "open") {
    const learned = feedback ? describeFeedback(feedback) : "no feedback (escalation)";
    return [`8 response   ${item.status} ${describeProposal(item.proposal)}; ${learned}`];
  }
  return !item && feedback ? [`8 response   corrected; ${describeFeedback(feedback)}`] : [];
}

function describeFeedback({ kind, action, senderClass }: Feedback): string {
  return `feedback ${kind} for ${action}/${senderClass}`;
}

function describeProposal({ action, params }: Proposal): string {
  return `${action} ${JSON.stringify(params)}`;
}
