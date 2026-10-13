import { Box, Text } from "ink";
import type { BucketStanding } from "../app/buckets.ts";
import { renderTranscript } from "../cli/render.ts";
import type { Transcript } from "../db/reads.ts";
import type { ActionName } from "../domain/actions.ts";
import { isBelow, proposalOf } from "../domain/policy.ts";
import { progressNote, progressPips } from "./learning/progress.ts";
import { LEVEL_STYLE, TitleRow } from "./levels.tsx";
import { dateTime, firstLine, firstLines } from "./ui/text.ts";
import { actionWords, bucketWords, doneWords, outcomeWords, senderWords } from "./words.ts";

const BODY_LINES = 6;

export function TranscriptDetail({
  transcript,
  standing,
  showChain,
}: {
  transcript: Transcript;
  standing: BucketStanding | null;
  showChain: boolean;
}) {
  return (
    <Box flexDirection="column" overflow="hidden">
      <Heading transcript={transcript} />
      <EmailBody transcript={transcript} />
      <Proposal transcript={transcript} />
      {standing && <Learning standing={standing} />}
      <Chain transcript={transcript} open={showChain} />
    </Box>
  );
}

function Heading({ transcript: { email, decision } }: { transcript: Transcript }) {
  return (
    <Box flexDirection="column" flexShrink={0}>
      <TitleRow title={email.subject} level={decision.level} />
      <Text dimColor wrap="truncate-end">
        {email.from} · {senderWords(email.senderClass)} · {dateTime(email.receivedAt)}
      </Text>
    </Box>
  );
}

function EmailBody({ transcript: { email } }: { transcript: Transcript }) {
  return (
    <Box flexDirection="column" marginTop={1} overflow="hidden">
      <Text>{firstLines(email.body.trim(), BODY_LINES)}</Text>
    </Box>
  );
}

function Proposal({ transcript }: { transcript: Transcript }) {
  const { decision, item } = transcript;
  const { analysis, injection, payment } = decision;
  const { action, params } = item?.proposal ?? proposalOf(analysis);
  return (
    <Box
      flexDirection="column"
      flexShrink={0}
      marginTop={1}
      borderStyle="round"
      borderColor={LEVEL_STYLE[decision.level].color}
      paddingX={1}
    >
      {analysis ? (
        <>
          <Text>
            <Text bold>{headline(transcript, action)}</Text>
            <Text dimColor> · {analysis.summary}</Text>
          </Text>
          {Object.entries(params).map(([key, value]) => (
            <Text key={key} wrap="truncate-end">
              <Text dimColor>{key}: </Text>
              {firstLine(String(value))}
            </Text>
          ))}
        </>
      ) : (
        <Text>
          <Text bold>Injection suspected. </Text>
          <Text dimColor>{injection.evidence.join("; ")}</Text>
        </Text>
      )}
      {payment.suspected && (
        <Text color="red">Payment suspected: {payment.evidence.join("; ")}</Text>
      )}
      <Outcome transcript={transcript} />
    </Box>
  );
}

function Outcome({ transcript }: { transcript: Transcript }) {
  const outcome = outcomeWords(transcript);
  return outcome && outcome !== "open" ? <Text color="green">✓ {outcome}</Text> : null;
}

function Learning({ standing }: { standing: BucketStanding }) {
  const pips = progressPips(standing);
  return (
    <Box flexShrink={0}>
      <Text>
        <Text color="magenta">◆ Learning </Text>
        <Text dimColor>{bucketWords(standing.action, standing.senderClass)}: </Text>
        {pips && <Text color="magenta">{pips} </Text>}
        {progressNote(standing)}
      </Text>
    </Box>
  );
}

function Chain({ transcript, open }: { transcript: Transcript; open: boolean }) {
  return (
    <Box flexDirection="column" marginTop={1} flexShrink={0}>
      <Text bold>
        {open ? "▾" : "▸"} Transcript <Text dimColor>(space)</Text>
      </Text>
      {open &&
        renderTranscript(transcript)
          .split("\n")
          .slice(3)
          .map((line) => (
            <Text key={line} dimColor wrap="truncate-end">
              {line}
            </Text>
          ))}
    </Box>
  );
}

function headline({ decision }: Transcript, action: ActionName): string {
  return isBelow(decision.level, "ask") ? doneWords(action) : `Proposed: ${actionWords(action)}`;
}
