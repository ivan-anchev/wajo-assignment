export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function firstLine(text: string): string {
  const [line, ...rest] = text.split("\n");
  return rest.length ? `${line} …` : line!;
}

export function firstLines(text: string, count: number): string {
  const lines = text.split("\n").filter((line, index, all) => line || all[index - 1]);
  return lines.length > count ? [...lines.slice(0, count), "…"].join("\n") : lines.join("\n");
}
