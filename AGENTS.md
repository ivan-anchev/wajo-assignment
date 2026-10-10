# AGENTS.md

CLI agent: for each event it proposes one action, picks an autonomy level (`silent` < `notify` < `ask` < `escalate`), and learns from user feedback to ask less over time. v1 handles one event kind, incoming email from a simulated inbox; `Event` is a union so more kinds can be added. A safety floor in plain code can never be lowered by learning.

**Spec (source of truth):** [SPEC: Wajo take-home](https://linear.app/bubkomd/document/spec-wajo-take-home-source-of-truth-bf7215d8f358). Read it before implementing; ask before deviating. Deadline 2026-10-13.

## Commands

```bash
pnpm check        # typecheck + lint + fmt:check + test — must pass before handing work back
pnpm test         # vitest
pnpm fmt          # oxfmt, writes in place
pnpm agent eval   # scripted-user eval; writes RESULTS.md + transcripts/, exits 1 on a safety violation
```

## Stack

TypeScript on Node 24 (run via tsx), pnpm, Vercel AI SDK (`generateText` + `Output.object` + Zod), better-sqlite3, commander, vitest, oxlint/oxfmt. No agent frameworks (Mastra, LangGraph), no ORM.

## Layout

| Path            | Owns                                                                                                                                                                                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/agent`     | `createAgent`, the per-event flow (intake, analyze, injection check, level, act, transcript), user responses (`respond.ts`), learning from responses (`learn.ts`), preference extraction from edits and reject reasons (`extract-preference.ts`), pins (`pin.ts`), and the caller-handled `Refusal` (`refusal.ts`) |
| `src/domain`    | `types.ts` (every domain record), `actions.ts` (registry), `policy.ts` (floor, level, learner, pins)                                                                                                                                                                                                               |
| `src/files`     | Generic JSON-file reading against a zod schema                                                                                                                                                                                                                                                                     |
| `src/inbox`     | Simulated inbox reader and writer (`writeInbox`), and sender classification                                                                                                                                                                                                                                        |
| `src/llm`       | Model provider from `MODEL` env, record/replay middleware                                                                                                                                                                                                                                                          |
| `src/db`        | SQLite schema; `mailbox.ts` (emails, email state, drafts), `items.ts` (items), `feedback.ts` (feedback rows), `decision-log.ts` (decisions, executions, transcripts), `pins.ts` (pins), `preferences.ts` (preference text)                                                                                         |
| `src/cli`       | Thin commander adapter over the service                                                                                                                                                                                                                                                                            |
| `src/scenarios` | Eval scenario schema and `readScenarios`; shared by tests and the eval harness                                                                                                                                                                                                                                     |
| `eval/`         | Harness: scripted oracle, episodes, metrics, writes `RESULTS.md` + `transcripts/`                                                                                                                                                                                                                                  |
| `scenarios/`    | Eval scenarios, one per file: an email plus category, gold action/level and an optional correction. The directory is also a valid inbox (`INBOX_DIR=scenarios`).                                                                                                                                                   |
| `fixtures/llm/` | Recorded LLM responses, committed                                                                                                                                                                                                                                                                                  |

## Invariants (do not break)

- **LLM proposes, code decides.** The level is `max(floor, pin, learned + brake)`; the LLM never picks it.
- **Floor is pure:** `floor([proposed, requested], injectionSuspected)` sees no feedback, pins, or confidence. Money and injection escalate; external and irreversible ask; reversible is silent. `requested` (the action the email asks for) can only raise the floor. Every floor computation goes through this one helper.
- **Approval re-runs the floor** on the (possibly edited) payload together with the stored `requested`. Execution is at-most-once.
- **Injection-suspected emails** escalate, execute nothing, and never write feedback.
- **Feedback only comes from user commands**, never from email text. Email content is untrusted data in prompts.
- **Preference lines come only from `edit` and `reject --reason`, append-only, and the extraction runs before the response is written**, so a failed extraction changes nothing. The extractor sees the user's reason or edit, the current preferences, the sender, the proposed action and, for edits, the original proposal (tagged untrusted), never the email body or subject. Preferences shape what the LLM proposes, never the level.
- **Learned level is derived by query** over the feedback table, never stored.
- **All behavior lives in `createAgent(db, llm)`.** It takes and returns plain JSON-serializable data and prints nothing. CLI and eval are thin adapters with no business logic.
- **The registry drives everything:** the proposal schema, floor, and CLI derive from it. Adding an action is one entry.

## Working rules

- Simplicity over production readiness: no crash recovery, no speculative edge cases, no defensive guards against states the types exclude.
- LLM calls replay from `fixtures/llm/` by default; only `--live` hits the network and records. Tests never call a live model.
- Each spec invariant (§6) is a unit test against the public surface.
- All code lives in a folder under `src/`, grouped by area; no loose files in `src/`. Inside a folder, one file per concept, named after the concept (`policy.ts`, `mailbox.ts`); split a file only when it outgrows about 150 lines. Domain records live in `domain/types.ts`; types derived from the registry stay in `domain/actions.ts`. No barrel `index.ts` files: import the file directly.
- No code comments unless they explain a non-obvious flow, invariant, or workaround that the code itself cannot make clear. Never write comments that record session decisions, task context, or what was just changed; that belongs in commit messages.

## Commits

Conventional Commits: `<type>: <imperative summary> (WAJ-n)`. Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`. Subject under 72 characters, lowercase, no trailing period. One logical change per commit.
