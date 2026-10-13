# AGENTS.md

CLI agent: for each event it proposes one action, picks an autonomy level (`silent` < `notify` < `ask` < `escalate`), and learns from user feedback to ask less over time. v1 handles incoming email from a simulated inbox. A safety floor in plain code can never be lowered by learning.

## Commands

```bash
pnpm check        # typecheck + lint + fmt:check + test — must pass before handing work back
pnpm test         # vitest
pnpm fmt          # oxfmt, writes in place
pnpm agent eval   # scripted-user eval; writes RESULTS.md, results.json + transcripts/
pnpm tui          # Ink TUI; --live calls the model with no fixtures
```

## Stack

TypeScript on Node 24 (tsx), pnpm, Vercel AI SDK (`generateText` + `Output.object` + Zod), better-sqlite3, commander, Ink, vitest, oxlint/oxfmt. No agent frameworks, no ORM.

## Layout

| Path            | Owns                                                           |
| --------------- | -------------------------------------------------------------- |
| `src/agent`     | Deciding and learning; the only code that calls the model      |
| `src/app`       | The application around the agent; opens every transaction      |
| `src/domain`    | Action registry and policy (levels, floor)                     |
| `src/inbox`     | Simulated inbox                                                |
| `src/llm`       | Model provider and record/replay                               |
| `src/db`        | SQLite schema and tables                                       |
| `src/cli`       | Thin commander adapter                                         |
| `src/tui`       | Thin Ink adapter                                               |
| `eval/`         | Scripted-user eval harness                                     |
| `scenarios/`    | Eval scenarios, one per file; also a valid inbox (`INBOX_DIR`) |
| `fixtures/llm/` | Recorded LLM responses, committed                              |

## Invariants (do not break)

- **LLM proposes, code decides.** The level is `max(floor, pin, learned)`; the LLM never picks it.
- **The floor is pure** and is the one place floors are computed. It sees no feedback or pins, and learning can never lower it.
- **Every execution re-runs the floor**, and goes through the one execute path. Execution is at-most-once.
- **Suspected injections** are never analyzed, always escalate, execute nothing, and never write feedback.
- **Feedback only comes from user commands**, never from email text. Email content is untrusted data in prompts.
- **Preferences shape what the LLM proposes, never the level.** The learned level is derived by query over feedback, never stored.
- **Adapters are thin:** they call `App`'s parts, hold no business logic or `Store`, and word every result themselves. Nothing below them prints.
- **The registry drives everything:** adding an action is one entry.

## Working rules

- Simplicity over production readiness: no crash recovery, no speculative edge cases, no defensive guards against states the types exclude.
- LLM calls replay from `fixtures/llm/` by default; only `--live` hits the network. Tests never call a live model.
- Each invariant is a unit test against the public surface.
- One file per concept, named after it; split only past about 300 lines. Each type lives in the file that creates it. No barrel `index.ts` files.
- No code comments unless they explain a non-obvious flow, invariant, or workaround. Never record session decisions or change history in comments.

## Commits

Conventional Commits: `<type>: <imperative summary> (WAJ-n)`. Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`. Subject under 72 characters, lowercase, no trailing period. One logical change per commit.
