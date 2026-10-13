import type { ResponseResult, Responses } from "../../app/responses.ts";
import type { Item } from "../../db/items.ts";
import type { ItemResponse } from "../../domain/policy.ts";
import type { Prompt } from "../view-context.ts";
import { askForEdit } from "../edit-prompts.ts";

type Respond = (work: (responses: Responses) => ResponseResult | Promise<ResponseResult>) => void;

export type Answer = {
  response: ItemResponse;
  key: string;
  label: string;
  start: (item: Item, respond: Respond, prompt: (prompt: Prompt) => void) => void;
};

const ANSWERS: readonly Answer[] = [
  {
    response: "dismiss",
    key: "d",
    label: "Looks right",
    start: (item, respond) => respond((r) => r.dismiss(item.id)),
  },
  {
    response: "approve",
    key: "a",
    label: "Approve",
    start: (item, respond) => respond((r) => r.approve(item.id)),
  },
  {
    response: "edit",
    key: "e",
    label: "Edit",
    start: (item, respond, prompt) =>
      askForEdit("Do instead:", item.proposal, prompt, (edit) =>
        respond((r) => r.edit(item.id, edit)),
      ),
  },
  {
    response: "reject",
    key: "r",
    label: "Reject",
    start: (item, respond) => respond((r) => r.reject(item.id)),
  },
  {
    response: "reject",
    key: "R",
    label: "Reject with reason",
    start: (item, respond, prompt) =>
      prompt({
        kind: "text",
        label: "Why not? It may be noted as a preference",
        submit: (reason) => respond((r) => r.reject(item.id, reason || undefined)),
      }),
  },
  {
    response: "undo",
    key: "u",
    label: "Undo",
    start: (item, respond) => respond((r) => r.undo(item.id)),
  },
  {
    response: "undo",
    key: "c",
    label: "Undo and say what instead",
    start: (item, respond, prompt) =>
      askForEdit("Should have been:", item.proposal, prompt, (edit) =>
        respond((r) => r.correct(item.decisionId, edit)),
      ),
  },
];

export function answersFor(item: Item): Answer[] {
  return ANSWERS.filter((answer) => item.allowedResponses.includes(answer.response)).map(
    (answer) => (item.kind === "escalate" ? { ...answer, label: "Got it" } : answer),
  );
}
