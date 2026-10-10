import { InvalidArgumentError, Option } from "commander";
import type { Agent } from "../agent/agent.ts";

export type OpenAgent = (options: { live: boolean }) => Agent;

export function liveOption(): Option {
  return new Option(
    "--live",
    "call the real model for requests with no recorded fixture, and record them",
  ).default(false);
}

export function positiveInteger(example: string): (value: string) => number {
  return (value) => {
    if (!/^[1-9]\d*$/.test(value)) {
      throw new InvalidArgumentError(`expected ${example}`);
    }
    return Number(value);
  };
}
