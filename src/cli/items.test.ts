import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../app/app.ts";
import { agentProposing, modelProposing, SEND_REPLY } from "../agent/test-agents.ts";
import { Store } from "../db/store.ts";
import { addItemCommands } from "./items.ts";

let store: Store;

beforeEach(async () => {
  store = Store.open(":memory:");
  await agentProposing(store, SEND_REPLY);
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("agent edit --set", () => {
  it("passes a number to the registry schema", async () => {
    await expect(
      edit("action=pay_invoice", "amount=120", "currency=EUR", "payee=Acme"),
    ).rejects.toThrow(/pay_invoice must be escalated/);
  });

  it("keeps a value that is not JSON as a string", async () => {
    await edit("action=label", "label=reading list");

    expect(app().transcript("001")!.item!.proposal).toEqual({
      action: "label",
      params: { label: "reading list" },
    });
  });
});

function app() {
  return new App({ store, model: modelProposing(SEND_REPLY) });
}

async function edit(...pairs: string[]): Promise<void> {
  const program = new Command();
  addItemCommands(program, app);
  await program.parseAsync(["edit", "1", ...pairs.flatMap((pair) => ["--set", pair])], {
    from: "user",
  });
}
