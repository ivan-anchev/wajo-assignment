import { z } from "zod";
import { deleteDraft, readEmailState, saveDraft, updateEmailState } from "../store/index.ts";
import { defineAction } from "./action-definition.ts";

const noParams = z.object({});
const noEffect = () => {};

// Simulator: reversible actions change local email state; the rest never leave the process.
export const ACTIONS = [
  defineAction({
    name: "none",
    riskClass: "reversible",
    params: noParams,
    execute: noEffect,
    undo: noEffect,
  }),
  defineAction({
    name: "archive",
    riskClass: "reversible",
    params: noParams,
    execute: (_, { db, emailId, now }) => updateEmailState(db, emailId, { archivedAt: now }),
    undo: (_, { db, emailId }) => updateEmailState(db, emailId, { archivedAt: null }),
  }),
  defineAction({
    name: "mark_read",
    riskClass: "reversible",
    params: noParams,
    execute: (_, { db, emailId, now }) => updateEmailState(db, emailId, { readAt: now }),
    undo: (_, { db, emailId }) => updateEmailState(db, emailId, { readAt: null }),
  }),
  defineAction({
    name: "snooze",
    riskClass: "reversible",
    params: z.object({ until: z.iso.datetime() }),
    execute: ({ until }, { db, emailId }) => updateEmailState(db, emailId, { snoozedUntil: until }),
    undo: (_, { db, emailId }) => updateEmailState(db, emailId, { snoozedUntil: null }),
  }),
  defineAction({
    name: "label",
    riskClass: "reversible",
    params: z.object({ label: z.string() }),
    execute: ({ label }, { db, emailId }) =>
      updateEmailState(db, emailId, { labels: [...readEmailState(db, emailId).labels, label] }),
    undo: ({ label }, { db, emailId }) =>
      updateEmailState(db, emailId, {
        labels: readEmailState(db, emailId).labels.filter((existing) => existing !== label),
      }),
  }),
  defineAction({
    name: "draft_reply",
    riskClass: "reversible",
    params: z.object({ body: z.string() }),
    execute: ({ body }, { db, emailId }) => saveDraft(db, emailId, body),
    undo: (_, { db, emailId }) => deleteDraft(db, emailId),
  }),
  defineAction({
    name: "send_reply",
    riskClass: "external",
    params: z.object({ body: z.string() }),
    execute: noEffect,
  }),
  defineAction({
    name: "forward",
    riskClass: "external",
    params: z.object({ to: z.email() }),
    execute: noEffect,
  }),
  defineAction({
    name: "unsubscribe",
    riskClass: "external",
    params: noParams,
    execute: noEffect,
  }),
  defineAction({
    name: "delete_permanently",
    riskClass: "irreversible",
    params: noParams,
    execute: noEffect,
  }),
  defineAction({
    name: "pay_invoice",
    riskClass: "money",
    params: z.object({ amount: z.number().positive(), currency: z.string(), payee: z.string() }),
    execute: noEffect,
  }),
] as const;

type RegisteredAction = (typeof ACTIONS)[number];
export type ActionName = RegisteredAction["name"];

export function actionFor<N extends ActionName>(name: N): Extract<RegisteredAction, { name: N }> {
  return ACTIONS.find((action) => action.name === name) as Extract<RegisteredAction, { name: N }>;
}
