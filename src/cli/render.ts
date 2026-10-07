import { ALLOWED_RESPONSES } from "../domain/policy.ts";
import type { Transcript } from "../domain/types.ts";

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

export function renderTranscript({ email, decision, item, executions }: Transcript): string {
  const { analysis, injection } = decision;
  return [
    `Email ${email.id}: "${email.subject}"`,
    `  ${email.from} -> ${email.to}  received ${email.receivedAt}`,
    ``,
    `1 intake     sender class: ${email.senderClass}`,
    `2 analyze    intent: ${analysis.intent}  confidence: ${analysis.confidence}`,
    `             summary: ${analysis.summary}`,
    `             proposal: ${analysis.proposal.action} ${JSON.stringify(analysis.proposal.params)}`,
    `3 injection  ${injection.suspected ? `SUSPECTED (${injection.evidence.join("; ")})` : "not suspected"}`,
    `4 floor      ${decision.floor}`,
    `5 level      ${decision.level}`,
    `6 act        ${describeOutcome(item, executions)}`,
  ].join("\n");
}

function describeOutcome(item: Transcript["item"], executions: Transcript["executions"]): string {
  const executed = executions.map((execution) => `executed ${execution.proposal.action}`);
  const opened = item
    ? [`opened ${item.kind} item #${item.id} [${ALLOWED_RESPONSES[item.kind].join(", ")}]`]
    : [];
  return [...executed, ...opened].join(", ");
}
