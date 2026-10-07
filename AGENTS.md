# AGENTS.md

CLI agent: for each event it proposes one action, picks an autonomy level (`silent` < `notify` < `ask` < `escalate`), and learns from user feedback to ask less over time. v1 handles one event kind, incoming email from a simulated inbox; `Event` is a union so more kinds can be added. A safety floor in plain code can never be lowered by learning.

**Spec (source of truth):** [SPEC: Wajo take-home](https://linear.app/bubkomd/document/spec-wajo-take-home-source-of-truth-bf7215d8f358). Read it before implementing; ask before deviating. Deadline 2026-10-13.

## Commands

```bash
pnpm check        # typecheck + lint + fmt:check + test — must pass before handing work back
pnpm test         # vitest
pnpm fmt          # oxfmt, writes in place
```

## Stack

TypeScript on Node 24 (run via tsx), pnpm, Vercel AI SDK (`generateObject` + Zod), better-sqlite3, commander, vitest, oxlint/oxfmt. No agent frameworks (Mastra, LangGraph), no ORM.

## Layout

| Path            | Owns                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------- |
| `src/actions`   | Action registry: one array, one entry per action (name, risk class, Zod params, execute, undo) |
| `src/policy`    | Floor, learner, pins: pure functions                                                           |
| `src/pipeline`  | Per-event steps: intake, analyze, injection check, level, act, transcript                      |
| `src/llm`       | Model provider from `MODEL` env, record/replay middleware                                      |
| `src/mail`      | Simulated inbox and sender classification                                                      |
| `src/store`     | SQLite schema and queries                                                                      |
| `src/cli`       | Thin commander adapter over the service                                                        |
| `src/shared`    | Generic helpers reused across folders                                                          |
| `eval/`         | Harness: scripted oracle, episodes, metrics, writes `RESULTS.md` + `transcripts/`              |
| `scenarios/`    | Eval scenario JSON (email, gold action/level, oracle answers)                                  |
| `fixtures/llm/` | Recorded LLM responses, committed                                                              |

## Invariants (do not break)

- **LLM proposes, code decides.** The level is `max(floor, pin, learned + brake)`; the LLM never picks it.
- **Floor is pure:** `floor(riskClass, injectionSuspected)` sees no feedback, pins, or confidence. Money and injection escalate; external and irreversible ask; reversible is silent.
- **Approval re-runs the floor** on the (possibly edited) payload. Execution is at-most-once.
- **Injection-suspected emails** escalate, execute nothing, and never write feedback.
- **Feedback only comes from user commands**, never from email text. Email content is untrusted data in prompts.
- **Learned level is derived by query** over the feedback table, never stored.
- **All behavior lives in `createAgent(db, llm)`.** It takes and returns plain JSON-serializable data and prints nothing. CLI and eval are thin adapters with no business logic.
- **The registry drives everything:** the proposal schema, floor, and CLI derive from it. Adding an action is one entry.

## Working rules

- Simplicity over production readiness: no crash recovery, no speculative edge cases, no defensive guards against states the types exclude.
- LLM calls replay from `fixtures/llm/` by default; only `--live` hits the network and records. Tests never call a live model.
- Each spec invariant (§6) is a unit test against the public surface.
- File names show their role: `*.model.ts` holds only types, Zod schemas, and the const tuples that back them; any other file is one behavior named after its exported function (`read-inbox.ts` → `readInbox`). Each folder's `index.ts` is its public surface.
- No code comments unless they explain a non-obvious flow, invariant, or workaround that the code itself cannot make clear. Never write comments that record session decisions, task context, or what was just changed; that belongs in commit messages.

## Commits

Conventional Commits: `<type>: <imperative summary> (WAJ-n)`. Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`. Subject under 72 characters, lowercase, no trailing period. One logical change per commit.
