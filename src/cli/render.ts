import type { Proposal } from "../domain/actions.ts";
import type {
  BucketStanding,
  Execution,
  Feedback,
  Item,
  ResponseResult,
  Transcript,
} from "../domain/types.ts";

export function renderDecisionLine({ email, decision, item, executions }: Transcript): string {
  return [
    email.id.padEnd(5),
    email.senderClass.padEnd(14),
    decision.analysis.proposal.action.padEnd(19),
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
    `-> ${describeProposal(open.proposal)}`,
    ...(decision.injection.suspected ? ["(injection suspected)"] : []),
    `[${open.allowedResponses.join(", ")}]`,
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
    `2 analyze    intent: ${analysis.intent}  confidence: ${analysis.confidence}`,
    `             summary: ${analysis.summary}`,
    `             proposal: ${describeProposal(analysis.proposal)}`,
    `3 injection  ${injection.suspected ? `SUSPECTED (${injection.evidence.join("; ")})` : "not suspected"}`,
    `4 floor      ${decision.floor}`,
    `5 learned    ${decision.learned} for ${analysis.proposal.action}/${email.senderClass}${decision.pin ? `, pinned at ${decision.pin}` : ""}`,
    `6 brake      ${decision.brake ? "fired: low confidence, one rung up (capped at ask)" : "not fired"}`,
    `7 level      ${decision.level}`,
    `8 act        ${describeOutcome(item, executions)}`,
    ...(item && item.status !== "open" ? [`9 response   ${describeResponse(item, feedback)}`] : []),
  ].join("\n");
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

function describeResponse(item: Item, feedback: Feedback | null): string {
  const learned = feedback
    ? `feedback ${feedback.kind} for ${feedback.action}/${feedback.senderClass}`
    : "no feedback (escalation)";
  return `${item.status} ${describeProposal(item.proposal)}; ${learned}`;
}

function describeProposal({ action, params }: Proposal): string {
  return `${action} ${JSON.stringify(params)}`;
}
