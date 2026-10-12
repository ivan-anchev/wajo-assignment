import { Argument, type Command } from "commander";
import { ACTIONS, type ActionName } from "../domain/actions.ts";
import { LEVELS, type Level } from "../domain/policy.ts";
import { SENDER_CLASSES, type SenderClass } from "../inbox/inbox.ts";
import type { OpenApp } from "./options.ts";
import { renderStanding } from "./render.ts";

export function addPinCommands(program: Command, openApp: OpenApp): void {
  const actionArg = new Argument("<action>").choices(ACTIONS.map((a) => a.name));
  const senderClassArg = new Argument("<senderClass>").choices(SENDER_CLASSES);
  const levelArg = new Argument("<level>").choices(LEVELS);

  program
    .command("pin")
    .description("Hold an action/sender-class bucket at a level or stricter")
    .addArgument(actionArg)
    .addArgument(senderClassArg)
    .addArgument(levelArg)
    .action((action: ActionName, senderClass: SenderClass, level: Level) => {
      console.log(renderStanding(openApp({ live: false }).buckets.pin(action, senderClass, level)));
    });

  program
    .command("unpin")
    .description("Remove a bucket's pin and report the level it falls back to")
    .addArgument(actionArg)
    .addArgument(senderClassArg)
    .action((action: ActionName, senderClass: SenderClass) => {
      console.log(renderStanding(openApp({ live: false }).buckets.unpin(action, senderClass)));
    });
}
