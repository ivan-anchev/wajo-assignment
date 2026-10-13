import { useRef, useState } from "react";
import { deliverNext, undelivered } from "../../inbox/inbox.ts";
import { coldStartNotice, deliveredNotice, type Notice } from "../notice.ts";
import type { InboxWatch } from "./use-inbox-watch.ts";

export type Progress = { at: number; total: number };

export function useDelivery({
  inboxDir,
  mailDir,
  watch,
  coldStart,
  notify,
}: {
  inboxDir: string;
  mailDir: string;
  watch: InboxWatch;
  coldStart: () => void;
  notify: (notice: Notice) => void;
}) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const run = useRef(0);

  function deliverOne() {
    notify(deliveredNotice(deliverNext(mailDir, inboxDir), mailDir));
    watch.check();
  }

  function deliverAll() {
    const total = undelivered(mailDir, inboxDir).length;
    if (total) {
      deliverEach(++run.current, 1, total);
    } else {
      notify(deliveredNotice(null, mailDir));
    }
  }

  function deliverEach(current: number, at: number, total: number) {
    watch.whenIdle(() => {
      if (current !== run.current || !deliverNext(mailDir, inboxDir)) {
        setProgress(null);
        return;
      }
      setProgress({ at, total });
      watch.check();
      deliverEach(current, at + 1, total);
    });
  }

  function reset() {
    watch.whenIdle(() => {
      run.current++;
      coldStart();
      notify(coldStartNotice());
    });
  }

  return { progress, deliverOne, deliverAll, reset };
}
