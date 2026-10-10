import { share, type Ratio } from "./metrics.ts";

export function table(header: string[], rows: string[][]): string {
  return [header, header.map(() => "---"), ...rows]
    .map((cells) => `| ${cells.join(" | ")} |`)
    .join("\n");
}

export function fraction(ratio: Ratio): string {
  return `${ratio.hits}/${ratio.of} (${percent(ratio)})`;
}

export function percent(ratio: Ratio): string {
  return `${Math.round(100 * share(ratio))}%`;
}
