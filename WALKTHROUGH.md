# Walkthrough: every file in plain English

The flow: **run** asks the app every question and saves the raw answers to `cache/`. **report** (replay) reads `cache/`, scores it with `score.ts`, and writes the report. Splitting these means you can re-score for free, without a key.

## Code

- `src/adapter.ts`: the only file that talks to the app or to Gemini. `LLM_PROVIDER` picks `fixture` (offline) or `gemini`. `openPipeline` loads the app's own code (embedder, vector store, answer function) and returns a function `question + topK -> retrieved passages, answer, refused?, estimated tokens`. `openJudge` is a Gemini call that grades an answer as correct or not; in fixture mode it returns nothing. Interview point: why one adapter? So switching or removing a provider touches one file.
- `src/run.ts`: loops configs x questions, times each one, calls the judge on answered questions, and writes `cache/<provider>/<config>.json`. It also records the app's git commit and the run time.
- `src/score.ts`: pure functions, no I/O. `hit` (retrieval), `citationOk`, `rubric` (numbers in the key fact must appear in the answer), `cost`, `wilson` (confidence interval), and `metrics` which combines them. This is the file to explain best; it has tests.
- `src/report.ts`: reads `cache/` and `configs.json`, calls `metrics`, writes `results.json`, `chart.png` and `REPORT.md`. The "what the numbers say" lines are generated from the numbers and say "cannot separate them" when intervals overlap. If a provider has no cache, it writes "not run with live key".
- `src/chart.ts`: draws grouped bars as SVG text and converts it to PNG with `sharp`.
- `tests/score.test.ts`: 5 tests for the scoring rules (wrong citation, invented marker, missing number, refusal rate, cost maths, interval).

## Data and config

- `data/questions.jsonl`: copy of the app's 40 questions: id, type, question, should it answer or refuse, expected document and section, key fact.
- `data/spot_check.json`: 10 answers read by hand, with a verdict and note. Written by the AI coding assistant on fixture output; redo on live output.
- `configs.json`: the two configs per provider (top-k, model) and the price table with its source.
- `cache/fixture/topk2.json`, `cache/fixture/topk4.json`: saved raw outputs of the fixture run. **Fixture data, not Gemini.** `cache/gemini/` does not exist yet.
- `results.json`, `chart.png`, `REPORT.md`: generated outputs. Do not edit by hand; run `npm run replay`.

## Project files

- `package.json`, `package-lock.json`: scripts (`replay`, `run`, `eval`, `test`) and two dependencies: `@google/genai` (Gemini) and `sharp` (SVG to PNG).
- `.env.example`: variable names. The real key goes in `.env.local`, which git ignores.
- `.gitignore`, `LICENSE` (MIT), `README.md`.
