import type { App } from "../app/app.ts";
import type { Transcript } from "../db/reads.ts";
import type { Notice } from "./notice.ts";

export type Prompt =
  | { kind: "text"; label: string; submit: (text: string) => void }
  | {
      kind: "choice";
      label: string;
      options: { label: string; value: string }[];
      choose: (value: string) => void;
    };

export type ViewContext = {
  app: App;
  version: number;
  history: Transcript[];
  height: number;
  active: boolean;
  zoomed: boolean;
  perform: (work: () => Notice | Promise<Notice>) => void;
  prompt: (prompt: Prompt) => void;
};
