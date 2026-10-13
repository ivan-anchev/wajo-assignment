import { Box, Text, useInput } from "ink";
import { useMemo } from "react";
import type { BucketStanding } from "../../app/buckets.ts";
import { LEVELS, isBelow, type Level } from "../../domain/policy.ts";
import { LEVEL_STYLE } from "../levels.tsx";
import { pinNotice } from "../notice.ts";
import { KeyHints } from "../ui/key-hints.tsx";
import { Split } from "../ui/split.tsx";
import { useCursor } from "../ui/use-cursor.ts";
import type { ViewContext } from "../view-context.ts";
import { bucketWords } from "../words.ts";
import { BucketDetail } from "./bucket-detail.tsx";
import { BucketList } from "./bucket-list.tsx";
import { Preferences } from "./preferences.tsx";
import { bucketNote } from "./progress.ts";
import { Timeline } from "./timeline.tsx";

export function LearningView({
  app,
  version,
  history,
  height,
  active,
  zoomed,
  perform,
  prompt,
}: ViewContext) {
  const standings = useMemo(() => app.buckets.standings(), [app, version]);
  const preferences = useMemo(() => app.reads.preferences(), [app, version]);
  const at = useCursor(standings.length, active);
  const selected = standings[at];

  function pin({ action, senderClass, floor, pin: current }: BucketStanding) {
    const levels = LEVELS.filter((level) => level !== "silent" && !isBelow(level, floor));
    prompt({
      kind: "choice",
      label: `Hold ${bucketWords(action, senderClass)} at:`,
      options: [
        ...levels.map((level) => ({ label: LEVEL_STYLE[level].label, value: level })),
        ...(current ? [{ label: "no pin", value: "" }] : []),
      ],
      choose: (level) =>
        perform(() =>
          pinNotice(
            level
              ? app.buckets.pin(action, senderClass, level as Level)
              : app.buckets.unpin(action, senderClass),
          ),
        ),
    });
  }

  useInput(
    (input) => {
      if (input === "p" && selected) {
        pin(selected);
      }
    },
    { isActive: active },
  );

  const bodyHeight = height - 1;
  return (
    <Box flexDirection="column" height={height}>
      {zoomed ? (
        <Split
          height={bodyHeight}
          leftWidth="55%"
          left={
            <>
              <Text bold>Trust by bucket</Text>
              <Text dimColor>autonomy per action and kind of sender</Text>
              <Box marginTop={1} flexDirection="column">
                <BucketList
                  standings={standings}
                  history={history}
                  at={at}
                  height={bodyHeight - 9}
                />
              </Box>
              <Timeline history={history} legend />
            </>
          }
          right={
            <>
              {selected && <BucketDetail standing={selected} history={history} />}
              <Preferences text={preferences} />
            </>
          }
        />
      ) : (
        <Box height={bodyHeight} flexDirection="column" overflow="hidden">
          <BucketList
            standings={standings}
            history={history}
            at={at}
            height={Math.min(Math.max(standings.length, 1), Math.floor(bodyHeight / 2))}
          />
          {selected && (
            <Text color="magenta" wrap="truncate-end">
              {"  ↳ "}
              {bucketNote(selected, history)}
            </Text>
          )}
          <Timeline history={history} legend={false} />
          <Preferences text={preferences} />
        </Box>
      )}
      {active && (
        <KeyHints
          keys={selected ? [{ key: "p", label: "Pin" }] : []}
          extra={
            zoomed
              ? "↑/↓ select · enter close · learning never goes below the safety floor"
              : "↑/↓ select · enter details"
          }
        />
      )}
    </Box>
  );
}
