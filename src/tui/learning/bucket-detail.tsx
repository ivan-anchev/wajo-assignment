import { Box, Text } from "ink";
import type { BucketStanding } from "../../app/buckets.ts";
import type { Transcript } from "../../db/reads.ts";
import { actionFor } from "../../domain/actions.ts";
import type { FeedbackKind, Level } from "../../domain/policy.ts";
import { LEVEL_STYLE, TitleRow } from "../levels.tsx";
import { clock } from "../ui/text.ts";
import { bucketWords } from "../words.ts";
import { bucketAnswers, bucketNote, progressPips } from "./progress.ts";

const ANSWER_WORDS: Record<FeedbackKind, string> = {
  approve: "approved",
  edit: "edited",
  reject: "rejected",
  dismiss: "looks right",
  undo: "undone",
  redirect: "corrected",
};

const SHOWN_ANSWERS = 8;

export function BucketDetail({
  standing,
  history,
}: {
  standing: BucketStanding;
  history: Transcript[];
}) {
  return (
    <Box flexDirection="column" flexShrink={0}>
      <TitleRow title={bucketWords(standing.action, standing.senderClass)} level={standing.level} />
      <Text color="magenta">{bucketNote(standing, history)}</Text>
      <Box flexDirection="column" marginTop={1}>
        <LevelRow
          name="Safety floor"
          level={standing.floor}
          note={`(${actionFor(standing.action).riskClass})`}
        />
        <LevelRow name="Learned" level={standing.learned} note={progressPips(standing) ?? ""} />
        <LevelRow name="Pinned" level={standing.pin} note="" />
      </Box>
      <Answers standing={standing} history={history} />
    </Box>
  );
}

function LevelRow({ name, level, note }: { name: string; level: Level | null; note: string }) {
  return (
    <Text wrap="truncate-end">
      <Text dimColor>{name.padEnd(14)}</Text>
      {level ? <Text color={LEVEL_STYLE[level].color}>{LEVEL_STYLE[level].label}</Text> : "no pin"}
      <Text dimColor> {note}</Text>
    </Text>
  );
}

function Answers({ standing, history }: { standing: BucketStanding; history: Transcript[] }) {
  const answers = bucketAnswers(history, standing).toSorted((a, b) =>
    b.feedback!.createdAt.localeCompare(a.feedback!.createdAt),
  );
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>
        Your answers <Text dimColor>({answers.length})</Text>
      </Text>
      {answers.slice(0, SHOWN_ANSWERS).map(({ feedback, email }) => (
        <Text key={feedback!.id} wrap="truncate-end">
          <Text dimColor>{clock(feedback!.createdAt)} </Text>
          {ANSWER_WORDS[feedback!.kind]}
          <Text dimColor> · {email.subject}</Text>
        </Text>
      ))}
      {!answers.length && <Text dimColor>none yet</Text>}
    </Box>
  );
}
