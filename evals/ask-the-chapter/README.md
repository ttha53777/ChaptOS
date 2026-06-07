# Ask the Chapter — Eval Harness

Offline pass/fail harness for the `/api/ai/chat` feature. Drives the same tool-calling loop as [app/api/ai/chat/route.ts](../../app/api/ai/chat/route.ts) in-process, using the shared system prompt from [lib/ai-prompt.ts](../../lib/ai-prompt.ts), and grades each case against tool calls, proposal emissions, and final-answer substrings.

## What it measures

For every case in [cases.jsonl](./cases.jsonl):

- **Tool selection** — did the model call the expected tool(s)?
- **Tool arguments** — did it pass the right `order_by` / `status` / filter args? (subset match)
- **Final-answer content** — does the answer mention the right brother/number/date?
- **Answer type** — `data` answer, `proposal` confirm card, `refuse`, or `clarify` (matching expectation)

A case passes only when every assertion holds.

## Prerequisites

1. `OPENAI_API_KEY` in `.env.local` (the runner reads it via `dotenv`).
2. A dev Postgres seeded with `npx prisma db seed` — the runner queries the real DB through Prisma exactly like the route does. When `DIRECT_URL` is set (Supabase), the runner uses it instead of the transaction-pooler `DATABASE_URL`, which drops connections under load (see `scripts/eval-preload.ts`).

## Run

```
npm run eval:chat          # or: npx tsx scripts/eval-ask-the-chapter.ts
```

Env knobs:

- `EVAL_CONCURRENCY=N` — cases run in parallel (default 4). Drop to `1` on an OpenAI key with a tight per-minute token budget; transient 429s/5xx are retried with backoff regardless.
- `EVAL_FILTER=substr[,substr]` — run only cases whose `id` or `category` contains a listed substring. Fast iteration on one area.
- `EVAL_ORG_ID=N` — org to query (default 1, the seed org).

This is a **pre-merge gate for AI changes**: run it (and keep it ≥ baseline, ideally all-green) before shipping a change to the chat route, tools, prompt, or model. It is intentionally *not* in the `tsc` gate — it needs a key, a seeded DB, and spends tokens.

Output is one line per case, then a summary:

```
[PASS] super-attendance-worst (1820ms, 2 iter)
[FAIL] deadlines-empty-broaden (2410ms, 2 iter)
        ↳ mustNotInclude present: "error"
...
──────────────────────────────────
Score: 24/31  (77.4%)
──────────────────────────────────
Failures by category:
  empty-broaden: 2
  superlative: 1
```

Exit code: `0` if every case passes, `1` if any case fails.

## Notes on determinism

- The system clock the model sees is pinned to **2026-05-23** (see `PINNED_DATE` in the runner) so cases referencing "this week" stay reproducible across days. The DB itself is whatever `prisma db seed` produced.
- The model is sampled at `temperature: 0.3` (matching production), so a small amount of run-to-run variance is expected — typically 1–2 cases on the margin. Re-run before declaring a regression.
- Cases run concurrently (default 4, see `EVAL_CONCURRENCY`) to keep wall-clock down; this is bounded to stay friendly with OpenAI rate limits and the DB pool. Transient OpenAI 429/5xx are retried with exponential backoff so a tight token budget doesn't fail cases spuriously.
- **Assertions are seed-coupled.** `mustInclude` values (brother names, dollar amounts) are derived from the seeded dev DB. If the seed changes, re-derive them — a failing data case may mean a stale assertion, not a model regression.

## Adding new cases

Each line in [cases.jsonl](./cases.jsonl) is one JSON object. The schema is documented in the `EvalCase` interface at the top of [scripts/eval-ask-the-chapter.ts](../../scripts/eval-ask-the-chapter.ts). Common fields:

| field | meaning |
|---|---|
| `id` | short stable slug, used in output |
| `question` | the user message |
| `expectedTools` | tool names the model should call |
| `toolMatch` | `all` (default), `any`, or `exact` |
| `expectedToolArgs` | per-tool, subset-match on call args |
| `mustInclude` / `mustNotInclude` | case-insensitive substrings the final text must / must-not contain |
| `expectAnswerType` | `data`, `proposal`, `refuse`, or `clarify` |
| `expectedProposalAction` | for `proposal` cases, the `action` of the emitted proposal |

The right time to add a case is when you find a real-world failure or you ship a fix — write the case that would have caught it, then check it passes.

## What this won't catch

- Tone, style, formatting nits — only structural correctness.
- Slow regressions in latency — we report `ms` per case but don't fail on it.
- DB-state mutations from `propose_*` tools — proposals are validated, never executed (matches production behavior).
- Auth, rate limits, SSE framing — those live in the route, not the loop.
