import { useEffect, useRef, useState } from "react";
import type { App } from "../../app/app.ts";
import type { InboxSource } from "../../inbox/inbox.ts";
import { arrivalNotice, failureNotice, type Notice } from "../notice.ts";

const WATCH_EVERY_MS = 5000;

export type InboxWatch = {
  check: () => void;
  whenIdle: (work: () => void) => void;
  deciding: boolean;
};

export function useInboxWatch(
  app: App,
  inbox: InboxSource,
  notify: (notice: Notice) => void,
): InboxWatch {
  const queue = useRef(Promise.resolve());
  const [deciding, setDeciding] = useState(false);

  function whenIdle(work: () => void) {
    queue.current = queue.current.then(work);
  }

  function check() {
    queue.current = queue.current
      .then(async () => {
        setDeciding(true);
        const decided = await app.intake.run(inbox);
        if (decided.length) {
          notify(arrivalNotice(decided));
        }
      })
      .catch((error: Error) => notify(failureNotice(error)))
      .finally(() => setDeciding(false));
  }

  useEffect(() => {
    check();
    const timer = setInterval(check, WATCH_EVERY_MS);
    return () => clearInterval(timer);
  }, []);

  return { check, whenIdle, deciding };
}
