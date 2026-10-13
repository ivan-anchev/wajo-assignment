import { Box, useApp, useInput, useWindowSize } from "ink";
import { useMemo, useState } from "react";
import type { App } from "../../app/app.ts";
import type { InboxSource } from "../../inbox/inbox.ts";
import { ActivityView } from "../activity/activity-view.tsx";
import { InboxView } from "../inbox/inbox-view.tsx";
import { LearningView } from "../learning/learning-view.tsx";
import { failureNotice, welcomeNotice, type Notice } from "../notice.ts";
import { Split, type Show } from "../ui/split.tsx";
import type { Prompt } from "../view-context.ts";
import { Footer } from "./footer.tsx";
import { Header } from "./header.tsx";
import { Pane } from "./pane.tsx";
import { useDelivery } from "./use-delivery.ts";
import { useInboxWatch } from "./use-inbox-watch.ts";

const PANES = [
  { name: "Inbox", View: InboxView },
  { name: "Activity", View: ActivityView },
  { name: "Learning", View: LearningView },
] as const;

const HISTORY = 500;
const CHROME_ROWS = 7;
const ACTIVITY_SHARE = 0.4;

export function Shell({
  app,
  inbox,
  mailDir,
  live,
  coldStart,
}: {
  app: App;
  inbox: InboxSource;
  mailDir: string;
  live: boolean;
  coldStart: () => void;
}) {
  const { exit } = useApp();
  const { rows } = useWindowSize();
  const [focus, setFocus] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [version, setVersion] = useState(0);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [thinking, setThinking] = useState(false);
  const [notice, setNotice] = useState(welcomeNotice(mailDir));
  const history = useMemo(() => app.reads.recentTranscripts(HISTORY), [app, version]);
  const openCount = useMemo(() => app.reads.openTranscripts().length, [app, version]);

  function notify(next: Notice) {
    setNotice(next);
    setVersion((v) => v + 1);
  }

  const watch = useInboxWatch(app, inbox, notify);
  const delivery = useDelivery({ inboxDir: inbox.inboxDir, mailDir, watch, coldStart, notify });

  async function perform(work: () => Notice | Promise<Notice>) {
    setThinking(true);
    try {
      notify(await work());
    } catch (error) {
      notify(failureNotice(error as Error));
    } finally {
      setThinking(false);
    }
  }

  function askToReset() {
    setPrompt({
      kind: "choice",
      label: "Reset to a cold start? Every email, decision, answer, pin and preference is deleted.",
      options: [
        { label: "Cancel", value: "cancel" },
        { label: "Reset", value: "reset" },
      ],
      choose: (value) => value === "reset" && delivery.reset(),
    });
  }

  useInput(
    (input, key) => {
      if (input === "q") {
        exit();
      } else if (key.tab) {
        setFocus((at) => (at + (key.shift ? PANES.length - 1 : 1)) % PANES.length);
      } else if (["1", "2", "3"].includes(input)) {
        setFocus(Number(input) - 1);
      } else if (key.return || (key.escape && zoomed)) {
        setZoomed((was) => !was);
      } else if (input === "n") {
        delivery.deliverOne();
      } else if (input === "N") {
        delivery.deliverAll();
      } else if (input === "x") {
        askToReset();
      }
    },
    { isActive: !prompt },
  );

  const height = rows - CHROME_ROWS;
  const activityHeight = Math.round(height * ACTIVITY_SHARE);
  const heights = zoomed
    ? [height, height, height]
    : [height, activityHeight, height - activityHeight];

  function pane(index: number) {
    const { name, View } = PANES[index]!;
    return (
      <Pane
        title={`${index + 1} ${name}${index === 0 && openCount ? ` (${openCount})` : ""}`}
        focused={index === focus}
        shown={!zoomed || index === focus}
        height={heights[index]!}
      >
        <View
          app={app}
          version={version}
          history={history}
          height={heights[index]! - 1}
          active={index === focus && !prompt}
          zoomed={zoomed}
          perform={(work) => void perform(work)}
          prompt={setPrompt}
        />
      </Pane>
    );
  }

  return (
    <Box flexDirection="column" height={rows - 1}>
      <Header
        history={history}
        live={live}
        progress={delivery.progress}
        thinking={watch.deciding || thinking}
      />
      <Split
        height={height}
        leftWidth="58%"
        show={shownColumns(zoomed, focus)}
        left={pane(0)}
        right={
          <>
            {pane(1)}
            {pane(2)}
          </>
        }
      />
      <Footer
        prompt={prompt}
        closePrompt={() => setPrompt(null)}
        notice={notice}
        help={`1-3 tab focus · n deliver next · N deliver all · x reset · q quit · watching ${inbox.inboxDir}/ ← ${mailDir}/`}
      />
    </Box>
  );
}

function shownColumns(zoomed: boolean, focus: number): Show {
  if (!zoomed) {
    return "both";
  }
  return focus === 0 ? "left" : "right";
}
