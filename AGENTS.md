# AGENTS.md

CLI agent: for each event it proposes one action, picks an autonomy level (`silent` < `notify` < `ask` < `escalate`), and learns from user feedback to ask less over time. v1 handles one event kind, incoming email from a simulated inbox; `Event` is a union so more kinds can be added. A safety floor in plain code can never be lowered by learning.

**Spec (source of truth):** [SPEC: Wajo take-home](https://linear.app/bubkomd/document/spec-wajo-take-home-source-of-truth-bf7215d8f358). Read it before implementing; ask before deviating. Deadline 2026-10-13.

## Commands

```bash
pnpm check        # typecheck + lint + fmt:check + test — must pass before handing work back
pnpm test         # vitest
pnpm fmt          # oxfmt, writes in place
pnpm agent eval   # scripted-user eval; writes RESULTS.md, results.json + transcripts/, exits 1 when a gate fails
```

## Stack

TypeScript on Node 24 (run via tsx), pnpm, Vercel AI SDK (`generateText` + `Output.object` + Zod), better-sqlite3, commander, vitest, oxlint/oxfmt. No agent frameworks (Mastra, LangGraph), no ORM.

## Layout

| Path            | Owns                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/agent`     | The agent that decides and learns: `agent.ts` (`Agent`: `decide`, `reflect`, `learn`), `learner.ts` (`Learner`: a bucket's history and pin; records an answer and the promotion it causes), `preferences.ts` (`extractPreferences`, the extractor prompt; `PreferenceMemory`, the stored list and its rules), `analyze.ts`, `check-injection.ts`, `check-payment.ts`, `match-patterns.ts`, `untrusted-email.ts`                      |
| `src/app`       | The application around the agent: `app.ts` (`App`: `intake`, `responses`, `buckets`, `reads`), `intake.ts` (`Intake.run`: new inbox emails, each decided, then recorded and acted on in its own transaction), `responses.ts` (`Responses`: approve, edit, reject, undo, dismiss, correct), `execution.ts` (`execute`, `undoExecution`), `buckets.ts` (`Buckets`: pin, unpin), `refusal.ts` (`Refusal`, the one error adapters catch) |
| `src/domain`    | `actions.ts` (registry), `policy.ts` (levels, analysis types, floor, level, learner, pins)                                                                                                                                                                                                                                                                                                                                           |
| `src/inbox`     | Simulated inbox reader and writer (`writeInbox`), JSON-file reading against a zod schema, and sender classification                                                                                                                                                                                                                                                                                                                  |
| `src/llm`       | Model provider from `MODEL` env, record/replay middleware                                                                                                                                                                                                                                                                                                                                                                            |
| `src/db`        | SQLite schema; `store.ts` (`Store`: the tables, `open`, `transaction`), `reads.ts` (`Reads`, `Transcript`: transcripts and the preference text, the write-free view adapters hold), `mailbox.ts` (emails, email state, drafts), `decisions.ts`, `executions.ts`, `items.ts`, `feedback.ts`, `pins.ts`, `preferences.ts`                                                                                                              |
| `src/cli`       | Thin commander adapter over `App`'s parts; it words every result, promotions included (`render.ts`)                                                                                                                                                                                                                                                                                                                                  |
| `eval/`         | Harness: scenario schema and `readScenarios` (`scenarios.ts`, shared with tests), scripted oracle, baseline + prequential episodes, scorer, metrics and gates; writes `RESULTS.md`, `results.json` + `transcripts/`                                                                                                                                                                                                                  |
| `scenarios/`    | Eval scenarios, one per file: an email plus category, split (train or held-out test), gold action/level and an optional correction. The directory is also a valid inbox (`INBOX_DIR=scenarios`).                                                                                                                                                                                                                                     |
| `fixtures/llm/` | Recorded LLM responses, committed                                                                                                                                                                                                                                                                                                                                                                                                    |

## Invariants (do not break)

- **LLM proposes, code decides.** The level is `max(floor, pin, learned)`; the LLM never picks it.
- **Floor is pure:** `floor([proposed, requested], [injection, payment])` sees no feedback or pins. Money, a suspected injection, and a suspected payment escalate; external and irreversible ask; reversible is silent. The payment verdict is a code-side pattern match on the email (an amount plus an IBAN or bank wording), so a payment escalates even when the LLM proposes and requests no payment. `requested` (the action the email asks for) can only raise the floor. Every floor computation goes through this one helper.
- **Every execution re-runs the floor** on the (possibly edited) payload together with the stored `requested`: `execute` in `src/app/execution.ts` is the only place an action runs. `edit` also checks before its extraction call, so a refused edit costs no model call. Execution is at-most-once: every answer re-reads and re-checks its item or decision inside its transaction.
- **Injection-suspected emails** are never analyzed (the judge runs first; `analysis` is null), escalate, execute nothing, and never write feedback: `Learner.record`, the only feedback write, records nothing for an escalated decision.
- **Feedback only comes from user commands**, never from email text. `Agent.learn` is called only from `Responses`; intake never teaches. Email content is untrusted data in prompts.
- **Preference lines come only from `edit`, `reject --reason`, and `correct`: the extractor rewrites the whole list (30 lines at most, keep every line, add or replace at most one), and `Responses` awaits `Agent.reflect` before it opens the answer's transaction**, so a failed extraction changes nothing. An answer that breaks the list rules (over 30 lines, or losing more than one current line) is discarded and the response still commits. The extractor sees the user's reason or edit, the current preferences, the sender and sender class, the analyzer's own summary and intent, the proposed action and, for edits and corrections, the original proposal (all tagged untrusted), never the email body or subject. Each new line names the kind of email it applies to, never only the sender. Preferences shape what the LLM proposes, never the level.
- **Learned level is derived by query** over the feedback table, never stored. An edit or correction that changes the action is recorded as `redirect`, which neither promotes nor demotes the proposed action's bucket.
- **Adapters hold `new App({ store, model })` and call its parts** (`app.intake`, `app.responses`, `app.buckets`, `app.reads`); `App` wires them and has no methods. Adapters contain no business logic, never hold the `Store`, and word every result themselves: results are facts (a promotion is the level the bucket left), plain JSON-serializable data, and nothing below the adapters prints.
- **`Agent` decides and learns, and only it calls the model.** It never opens a transaction, executes an action or reads the inbox. It reads the `feedback`, `pins` and `preferences` tables and writes only the feedback row and the preference list, in `learn`, inside the transaction its caller opened. Every transaction is opened in `src/app`.
- **The registry drives everything:** the proposal schema, floor, and CLI derive from it. Adding an action is one entry.

## Working rules

- Simplicity over production readiness: no crash recovery, no speculative edge cases, no defensive guards against states the types exclude.
- LLM calls replay from `fixtures/llm/` by default; only `--live` hits the network and records. Tests never call a live model.
- Each spec invariant (§6) is a unit test against the public surface.
- All code lives in a folder under `src/`, grouped by area; no loose files in `src/`. Inside a folder, one file per concept, named after the concept (`policy.ts`, `mailbox.ts`); split a file only when it outgrows about 300 lines. Each type lives in the file that creates it: row records in `src/db`, levels and analysis types in `domain/policy.ts`, registry-derived types in `domain/actions.ts`. No barrel `index.ts` files: import the file directly.
- No code comments unless they explain a non-obvious flow, invariant, or workaround that the code itself cannot make clear. Never write comments that record session decisions, task context, or what was just changed; that belongs in commit messages.

## Commits

Conventional Commits: `<type>: <imperative summary> (WAJ-n)`. Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`. Subject under 72 characters, lowercase, no trailing period. One logical change per commit.
