# rag-eval-harness

A small harness that scores the RAG app in [handbook-rag-chatbot](https://github.com/YazanAlshareef/handbook-rag-chatbot) on its 40 eval questions and compares two configurations.

**Status: not run with live key.** The committed numbers come from the offline **fixture** (a word-matching stand-in, not Gemini). They prove the harness works. They say nothing about how Gemini performs. The live path is written but has never been called.

## What it measures

For each configuration and each of the 40 questions (30 should be answered, 10 should be refused):

| Metric | Meaning |
|---|---|
| Retrieval hit rate | The expected document and section is among the top-k retrieved passages |
| Answer correctness, rubric | Every number in the question's key fact appears in the answer (only possible when the key fact has a number) |
| Answer correctness, LLM judge | A Gemini call grades the answer against the key fact (live runs only) |
| Citation accuracy | The answer's `[n]` markers are valid and one points at the expected section |
| Refusal accuracy | Unanswerable questions get the refusal sentence |
| Latency, cost estimate | Median and p95 per question; tokens (characters / 4) times the published per-token price |

Rates come with 95% Wilson confidence intervals, because 40 questions is a small sample.

## The two configurations

Defined in `configs.json`.

- **Fixture (committed result):** top-k 2 vs top-k 4, same offline stand-in model. Changing top-k needs no re-indexing, so it runs anywhere.
- **Live (not run):** `gemini-2.5-flash` vs `gemini-2.5-flash-lite`, both top-k 4.

## Run it

Needs Node 22.13 or newer and the app checked out next to this repo (`../handbook-rag-chatbot`, or set `RAG_APP_DIR`).

```bash
npm install
npm run replay     # offline: re-scores the saved outputs in cache/, rewrites results.json, chart.png, REPORT.md
npm test           # 5 tests for the scoring code
npm run eval       # runs the app on all questions with LLM_PROVIDER from .env.local, then scores them
```

`npm run replay` needs no key, no app and no network. That is the reproducible command.

### Live run with Gemini

1. In the app: put `GEMINI_API_KEY` in its `.env.local`, then `npm run ingest` to build `data/index.gemini.db`.
2. Here: copy `.env.example` to `.env.local`, set `LLM_PROVIDER=gemini` and `GEMINI_API_KEY`. The key lives only in that git-ignored file.
3. `npm run eval`. Live outputs go to `cache/gemini/` and the report gains a live section and `chart-gemini.png`.
4. Read 10 judged answers by hand and record them in `data/spot_check.json`.

## How an AI coding assistant helped

An AI coding assistant wrote the first version of every file from a written brief, looked up the current Gemini SDK and price pages, and ran the tests. I (Yazan) have to read, run and be able to explain each file; `WALKTHROUGH.md` is the map. The 10 spot-check verdicts in the committed report were also written by the assistant, not by me, and are marked that way. Redo them yourself.

## What broke and how it got fixed

- The first shell command that wrote several files in one go failed on an unbalanced quote and wrote only some of them. The files were rewritten one by one.
- The app's `ask()` has a fixed top-k of 4, so it cannot test top-k 2. The harness reuses the app's embedding, store and answer code but repeats the few lines of `ask()` with top-k as a parameter. Check: at top-k 4 the harness reproduces the app's own `npm run eval` fixture numbers (answered 27, source in top-4 22, cited 20, refused 7).

## Limits

- 40 questions, one run per config. Differences under about 15 points are noise.
- Fixture results are not Gemini results. Fixture latency is local code speed.
- The rubric only sees numbers; the judge is uncalibrated; citation accuracy does not check that the text supports the claim.
- Cost uses estimated tokens and prices read from Google's pricing page on 2026-11-10.
- `src/adapter.ts` repeats the app's `ask()` logic; if the app changes, update it.
- The app's questions were also used to tune the fixture threshold, so fixture scores are optimistic.
- Nothing here was tested against a live Gemini model, including the judge call. `run.ts` retries 429 and 5xx errors on the app and judge calls and saves progress after every question (re-running resumes; `--fresh` starts over), but the retry path has never met a real rate limit.

## License

MIT
