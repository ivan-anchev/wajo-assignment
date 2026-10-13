import { Box, Text, useInput } from "ink";
import { useMemo, useState } from "react";
import type { Transcript } from "../../db/reads.ts";
import { isBelow, proposalOf } from "../../domain/policy.ts";
import { askForEdit } from "../edit-prompts.ts";
import { LevelDot } from "../levels.tsx";
import { answeredNotice } from "../notice.ts";
import { TranscriptDetail } from "../transcript-detail.tsx";
import { Empty } from "../ui/empty.tsx";
import { KeyHints } from "../ui/key-hints.tsx";
import { Pointer, ScrollList } from "../ui/scroll-list.tsx";
import { Split } from "../ui/split.tsx";
import { clock } from "../ui/text.ts";
import { useCursor } from "../ui/use-cursor.ts";
import type { ViewContext } from "../view-context.ts";
import { outcomeWords, whatIWant } from "../words.ts";

export function ActivityView({
  app,
  history,
  height,
  active,
  zoomed,
  perform,
  prompt,
}: ViewContext) {
  const decisions = useMemo(() => history.toReversed(), [history]);
  const at = useCursor(decisions.length, active);
  const [showChain, setShowChain] = useState(true);
  const selected = decisions[at];

  function correct({ decision }: Transcript) {
    askForEdit("Should have been:", proposalOf(decision.analysis), prompt, (edit) =>
      perform(async () => answeredNotice(await app.responses.correct(decision.id, edit))),
    );
  }

  useInput(
    (input) => {
      if (input === " ") {
        setShowChain((shown) => !shown);
      } else if (input === "c" && selected && correctable(selected)) {
        correct(selected);
      }
    },
    { isActive: active },
  );

  if (!selected) {
    return <Empty height={height} title="No decisions yet." hint="Press n to deliver an email." />;
  }

  return (
    <Box flexDirection="column" height={height}>
      <Split
        height={height - 1}
        leftWidth="40%"
        show={zoomed ? "both" : "left"}
        left={
          <ScrollList
            rows={decisions.map((transcript, index) => (
              <ActivityLine
                key={transcript.decision.id}
                transcript={transcript}
                selected={index === at}
              />
            ))}
            at={at}
            height={height - 1}
          />
        }
        right={<TranscriptDetail transcript={selected} standing={null} showChain={showChain} />}
      />
      {active && (
        <KeyHints
          keys={correctable(selected) ? [{ key: "c", label: "Correct" }] : []}
          extra={
            zoomed ? "↑/↓ select · space transcript · enter close" : "↑/↓ select · enter details"
          }
        />
      )}
    </Box>
  );
}

function ActivityLine({ transcript, selected }: { transcript: Transcript; selected: boolean }) {
  const { decision, email } = transcript;
  const outcome = outcomeWords(transcript);
  return (
    <Text wrap="truncate-end" bold={selected}>
      <Pointer selected={selected} />
      <Text dimColor>{clock(decision.createdAt)} </Text>
      <LevelDot level={decision.level} /> {whatIWant(transcript)}
      {outcome && <Text color={outcome === "open" ? "yellow" : "green"}> · {outcome}</Text>}
      <Text dimColor> · {email.subject}</Text>
    </Text>
  );
}

function correctable({ decision, item, feedback }: Transcript): boolean {
  return isBelow(decision.level, "ask") && !feedback && (!item || item.status === "open");
}
