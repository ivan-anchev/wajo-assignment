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

| Path            | Owns                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/agent`     | `agent.ts` (`Agent`): per-event flow (intake, injection check, analyze, level, act, transcript), responses and the caller-handled `Refusal`, correction of decisions that ran without asking; `learner.ts` (`Learner`: feedback, promotions, pins), `preferences.ts` (`PreferenceMemory`: extraction from edits, reject reasons and corrections), `analyze.ts`, `check-injection.ts`, `untrusted-email.ts` |
| `src/domain`    | `actions.ts` (registry), `policy.ts` (levels, analysis types, floor, level, learner, pins)                                                                                                                                                                                                                                                                                                                 |
| `src/inbox`     | Simulated inbox reader and writer (`writeInbox`), JSON-file reading against a zod schema, and sender classification                                                                                                                                                                                                                                                                                        |
| `src/llm`       | Model provider from `MODEL` env, record/replay middleware                                                                                                                                                                                                                                                                                                                                                  |
| `src/db`        | SQLite schema; `store.ts` (`Store`, `open`, `transaction`, transcripts), `mailbox.ts` (emails, email state, drafts), `decisions.ts`, `executions.ts`, `items.ts`, `feedback.ts`, `pins.ts`, `preferences.ts`                                                                                                                                                                                               |
| `src/cli`       | Thin commander adapter over the service                                                                                                                                                                                                                                                                                                                                                                    |
| `eval/`         | Harness: scenario schema and `readScenarios` (`scenarios.ts`, shared with tests), scripted oracle, baseline + prequential episodes, scorer, metrics and gates; writes `RESULTS.md`, `results.json` + `transcripts/`                                                                                                                                                                                        |
| `scenarios/`    | Eval scenarios, one per file: an email plus category, split (train or held-out test), gold action/level and an optional correction. The directory is also a valid inbox (`INBOX_DIR=scenarios`).                                                                                                                                                                                                           |
| `fixtures/llm/` | Recorded LLM responses, committed                                                                                                                                                                                                                                                                                                                                                                          |

## Invariants (do not break)

- **LLM proposes, code decides.** The level is `max(floor, pin, learned)`; the LLM never picks it.
- **Floor is pure:** `floor([proposed, requested], [injection, payment])` sees no feedback or pins. Money, a suspected injection, and a suspected payment escalate; external and irreversible ask; reversible is silent. The payment verdict is a code-side pattern match on the email (an amount plus an IBAN or bank wording), so a payment escalates even when the LLM proposes and requests no payment. `requested` (the action the email asks for) can only raise the floor. Every floor computation goes through this one helper.
- **Approval re-runs the floor** on the (possibly edited) payload together with the stored `requested`. Execution is at-most-once.
- **Injection-suspected emails** are never analyzed (the judge runs first; `analysis` is null), escalate, execute nothing, and never write feedback.
- **Feedback only comes from user commands**, never from email text. Email content is untrusted data in prompts.
- **Preference lines come only from `edit`, `reject --reason`, and `correct`: the extractor rewrites the whole list (30 lines at most, keep every line, add or replace at most one), and the extraction runs before the response is written**, so a failed extraction changes nothing. An answer that breaks the list rules (over 30 lines, or losing more than one current line) is discarded and the response still commits. The extractor sees the user's reason or edit, the current preferences, the sender and sender class, the analyzer's own summary and intent, the proposed action and, for edits and corrections, the original proposal (all tagged untrusted), never the email body or subject. Each new line names the kind of email it applies to, never only the sender. Preferences shape what the LLM proposes, never the level.
- **Learned level is derived by query** over the feedback table, never stored. An edit or correction that changes the action is recorded as `redirect`, which neither promotes nor demotes the proposed action's bucket.
- **All behavior lives in `new Agent({ store, model })`.** It takes and returns plain JSON-serializable data and prints nothing. CLI and eval are thin adapters with no business logic.
- **The registry drives everything:** the proposal schema, floor, and CLI derive from it. Adding an action is one entry.

## Working rules

- Simplicity over production readiness: no crash recovery, no speculative edge cases, no defensive guards against states the types exclude.
- LLM calls replay from `fixtures/llm/` by default; only `--live` hits the network and records. Tests never call a live model.
- Each spec invariant (§6) is a unit test against the public surface.
- All code lives in a folder under `src/`, grouped by area; no loose files in `src/`. Inside a folder, one file per concept, named after the concept (`policy.ts`, `mailbox.ts`); split a file only when it outgrows about 300 lines. Each type lives in the file that creates it: row records in `src/db`, levels and analysis types in `domain/policy.ts`, registry-derived types in `domain/actions.ts`. No barrel `index.ts` files: import the file directly.
- No code comments unless they explain a non-obvious flow, invariant, or workaround that the code itself cannot make clear. Never write comments that record session decisions, task context, or what was just changed; that belongs in commit messages.

## Commits

Conventional Commits: `<type>: <imperative summary> (WAJ-n)`. Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`. Subject under 72 characters, lowercase, no trailing period. One logical change per commit.
