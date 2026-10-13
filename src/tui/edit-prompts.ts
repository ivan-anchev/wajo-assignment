import { z } from "zod";
import {
  ACTIONS,
  actionFor,
  type ActionName,
  type Proposal,
  type ProposalEdit,
} from "../domain/actions.ts";
import { firstLine } from "./ui/text.ts";
import type { Prompt } from "./view-context.ts";
import { choiceWords } from "./words.ts";

export function askForEdit(
  label: string,
  current: Proposal,
  prompt: (prompt: Prompt) => void,
  done: (edit: ProposalEdit) => void,
): void {
  prompt({
    kind: "choice",
    label,
    options: currentFirst(current.action).map((name) => ({
      label: choiceWords(name),
      value: name,
    })),
    choose: (action) => askParams(action as ActionName, current, prompt, done),
  });
}

function askParams(
  action: ActionName,
  current: Proposal,
  prompt: (prompt: Prompt) => void,
  done: (edit: ProposalEdit) => void,
): void {
  const params: z.ZodObject = actionFor(action).params;
  const fields = Object.entries(params.shape);
  const kept = action === current.action ? current.params : {};

  const ask = (index: number, edit: ProposalEdit): void => {
    const [key, schema] = fields[index] ?? [];
    if (!key) {
      return done(edit);
    }
    prompt({
      kind: "text",
      label: kept[key] === undefined ? key : `${key} (enter keeps ${firstLine(String(kept[key]))})`,
      submit: (text) => ask(index + 1, text ? { ...edit, [key]: typed(text, schema!) } : edit),
    });
  };

  ask(0, { action });
}

function currentFirst(action: ActionName): ActionName[] {
  return [action, ...ACTIONS.map(({ name }) => name).filter((name) => name !== action)];
}

function typed(text: string, schema: z.ZodType): unknown {
  return schema instanceof z.ZodNumber ? Number(text) : text;
}
