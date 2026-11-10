// npm run run                 -> uses LLM_PROVIDER (default fixture)
// npm run run -- --fresh      -> ignore saved progress and start over
// Runs every question through every config and saves raw outputs to cache/<provider>/<config>.json
// after EACH question, so a crash or rate limit loses at most one question. Re-running resumes.
// report.ts scores those files later, offline.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { appDir, openJudge, openPipeline, providerName } from "./adapter.ts";
import type { Question, Rec } from "./score.ts";

const name = providerName();
const fresh = process.argv.includes("--fresh");
const cfg = JSON.parse(fs.readFileSync("configs.json", "utf8"))[name];
const qs: Question[] = fs.readFileSync("data/questions.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const judge = openJudge(name);

let commit = "unknown";
try {
  commit = execFileSync("git", ["-C", appDir(), "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
} catch {
  /* app is not a git checkout */
}

// Retry on rate limits (429) and server errors (5xx); anything else is a real bug, so it throws.
async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (i >= tries || (status !== 429 && (status ?? 0) < 500)) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
}

fs.mkdirSync(path.join("cache", name), { recursive: true });
for (const c of cfg.configs as { name: string; topK: number; chatModel?: string }[]) {
  const file = path.join("cache", name, `${c.name}.json`);
  const save = (records: Rec[]) => {
    const meta = { provider: name, config: c, ranAt: new Date().toISOString(), appCommit: commit, questionsFile: "data/questions.jsonl" };
    fs.writeFileSync(file + ".tmp", JSON.stringify({ meta, records }, null, 1) + "\n");
    fs.renameSync(file + ".tmp", file); // never leave a half-written cache file
  };

  let records: Rec[] = [];
  if (!fresh && fs.existsSync(file)) {
    const old = JSON.parse(fs.readFileSync(file, "utf8"));
    // only resume when the settings are identical, otherwise the old answers belong to another config
    if (JSON.stringify(old.meta.config) === JSON.stringify(c) && old.meta.appCommit === commit) records = old.records;
  }
  const done = new Set(records.map((r) => r.id));
  const todo = qs.filter((q) => !done.has(q.id));
  if (!todo.length) {
    console.log(`${name}/${c.name}: already complete (${records.length}), skipped. Use --fresh to redo.`);
    continue;
  }
  const run = await openPipeline(name, c.chatModel);
  for (const q of todo) {
    const t0 = performance.now();
    const o = await withRetry(() => run(q.question, c.topK));
    const latencyMs = Math.round(performance.now() - t0);
    let verdict = null;
    if (q.expect === "answer" && !o.refused) verdict = await withRetry(() => judge(q.question, q.key_fact ?? "", o.answer));
    if (q.expect === "answer" && o.refused && name === "gemini") verdict = { correct: false, reason: "app refused an answerable question" };
    records.push({ id: q.id, ...o, latencyMs, judge: verdict });
    save(records);
  }
  console.log(`${name}/${c.name}: ${records.length} questions saved (${todo.length} new)`);
}
