export const LEVELS = ["silent", "notify", "ask", "escalate"] as const;
export type Level = (typeof LEVELS)[number];

export type ItemKind = Exclude<Level, "silent">;
