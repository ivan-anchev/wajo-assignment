import { Box, useInput } from "ink";
import { useMemo, useState } from "react";
import type { App } from "../../app/app.ts";
import type { Transcript } from "../../db/reads.ts";
import { isBelow, proposalOf } from "../../domain/policy.ts";
import { sortByUrgency } from "../levels.tsx";
import { answeredNotice } from "../notice.ts";
import { TranscriptDetail } from "../transcript-detail.tsx";
import { Empty } from "../ui/empty.tsx";
import { KeyHints } from "../ui/key-hints.tsx";
import { Split } from "../ui/split.tsx";
import { useCursor } from "../ui/use-cursor.ts";
import type { ViewContext } from "../view-context.ts";
import { answersFor } from "./answers.ts";
import { ItemList } from "./item-list.tsx";

export function InboxView({ app, version, height, active, zoomed, perform, prompt }: ViewContext) {
  const open = useMemo(() => sortByUrgency(app.reads.openTranscripts()), [app, version]);
  const at = useCursor(open.length, active);
  const [showChain, setShowChain] = useState(false);
  const selected = open[at];
  const answers = selected ? answersFor(selected.item!) : [];

  useInput(
    (input) => {
      const chosen = answers.find((answer) => answer.key === input);
      if (input === " ") {
        setShowChain((shown) => !shown);
      } else if (chosen) {
        chosen.start(
          selected!.item!,
          (work) => perform(async () => answeredNotice(await work(app.responses))),
          prompt,
        );
      }
    },
    { isActive: active },
  );

  if (!selected) {
    return (
      <Empty height={height} title="Nothing needs you." hint="Press n to deliver the next email." />
    );
  }

  return (
    <Box flexDirection="column" height={height}>
      <Split
        height={height - 1}
        leftWidth="40%"
        left={<ItemList open={open} cursor={at} height={height - 1} />}
        right={
          <TranscriptDetail
            transcript={selected}
            standing={standingOf(app, selected)}
            showChain={showChain}
          />
        }
      />
      {active && (
        <KeyHints
          keys={answers}
          extra={`↑/↓ select · space transcript · enter ${zoomed ? "close" : "details"}`}
        />
      )}
    </Box>
  );
}

function standingOf(app: App, { decision, email }: Transcript) {
  return decision.analysis && isBelow(decision.level, "escalate")
    ? app.buckets.standing(proposalOf(decision.analysis).action, email.senderClass)
    : null;
}
