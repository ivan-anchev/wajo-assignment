import { InvalidArgumentError, Option } from "commander";
import type { App } from "../app/app.ts";

export type OpenApp = (options: { live: boolean }) => App;

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
