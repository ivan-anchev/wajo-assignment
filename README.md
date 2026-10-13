# Email agent

An agent that reads a simulated inbox and, for each email, proposes one action and decides how
much autonomy to take: `silent`, `notify`, `ask`, or `escalate`. It learns from the user's answers
so it asks less over time. A safety floor in code never moves. `DESIGN.md` has the key decisions,
`RESULTS.md` the eval numbers, `transcripts/` one decision chain per scenario.

No API key is needed unless a command says `--live`: every other model call replays from
`fixtures/llm/`.

## Install

Install Node 24 from [https://nodejs.org](https://nodejs.org), or with `nvm install 24` or `fnm install 24`.

Enable pnpm and install deps

```sh
corepack enable
pnpm install
```

(Optional) Create the local config. Only `--live` reads it; every other command runs without it:

```sh
cp .env.example .env
```

Out of the box the project uses the Anthropic provider, which recorded every fixture, so another
`MODEL` needs `--live` and that provider's API key.

## Demo

```sh
pnpm tui          # replays recorded model answers; no API key needed
pnpm tui --live   # calls the model, needs .env and an API key
```

Press `n` to deliver and process the next scenario email (or `N` to dump the full inbox) from `scenarios/`

Press `x` to reset inbox and db.

![The TUI after 33 emails: Inbox on the left, Activity and Learning on the right](docs/tui.png)

**Inbox** lists per-email results from the agent that need you:

- escalations, which executed nothing
- asks, which wait for your answer
- notifications, which ran automatically and can be undone.

The selected email shows its decision, how far its learning bucket is from the next level, and its transcript.

**Activity** lists every decision, silent ones included, and what you answered.

**Learning** lists every bucket with its level, a timeline of which emails needed you, and the preferences the agent learned from your reasons.

## Eval and checks

```sh
pnpm check          # typecheck, lint, format check, tests
pnpm agent eval     # plays every scenario; writes RESULTS.md, results.json, transcripts/
```

`RESULTS.md` is the output of the committed eval run: the metrics per episode and the gates. The
model answers it replayed are committed in `fixtures/llm/` for ease of review, so the same run can
be repeated offline, and `transcripts/` can be read without running anything.

## CLI

The same agent, one command per step. It reads `scenarios` by default.

```sh
pnpm agent run                   # decide every new email, one line each
pnpm agent inbox                 # open asks, notifications, escalations
pnpm agent approve 1             # or: edit, reject, undo, dismiss <id>
pnpm agent correct 2 --set ...   # say what a decision that ran should have done
pnpm agent log                   # every decision, silent ones included
pnpm agent transcript <emailId>  # the decision chain for one email
pnpm agent pin archive newsletter ask
pnpm agent --help                # all commands and the action registry
```

`rm agent.db` resets the agent to a cold start.

## Replay

Each model request is hashed. Its answer is read from `fixtures/llm/<hash>.json`. Without
`--live`, a missing fixture is an error that names the file. The fixtures are committed, so the
TUI, the CLI, the tests, and the eval all run offline and give the same answers every time.

## Re-record

In `.env`, set `MODEL` and the API key of its provider.  
Run the eval live. It records new fixtures and regenerates the results:

```sh
 pnpm agent eval --live
```

Record the sample inbox again, since its fixtures are read by the tests:

```sh
rm agent.db && pnpm agent run --live
```

Each live run draws new samples from the model, so a number can move by a scenario or two with no
code change. Compare numbers within one run.

## Configuration

| Variable    | Default                      | Meaning                               |
| ----------- | ---------------------------- | ------------------------------------- |
| `MODEL`     | `anthropic:claude-haiku-5-5` | `anthropic:` model                    |
| `AGENT_DB`  | `agent.db`                   | SQLite file; delete to reset          |
| `INBOX_DIR` | `/scenarios`                 | the inbox to read                     |
| `CONTACTS`  | `/fixtures/contacts.json`    | The user's address and known contacts |

The TUI delivers into `inbox/`, which is git-ignored, and watches it.
