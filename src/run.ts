// npm run run                 -> uses LLM_PROVIDER (default fixture)
// Runs every question through every config and saves raw outputs to cache/<provider>/<config>.json.
// report.ts scores those files later, offline.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { appDir, openJudge, openPipeline, providerName } from "./adapter.ts";
import type { Question, Rec } from "./score.ts";

const name = providerName();
const cfg = JSON.parse(fs.readFileSync("configs.json", "utf8"))[name];
const qs: Question[] = fs.readFileSync("data/questions.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const judge = openJudge(name);

let commit = "unknown";
try {
  commit = execFileSync("git", ["-C", appDir(), "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
} catch {
  /* app is not a git checkout */
}

fs.mkdirSync(path.join("cache", name), { recursive: true });
for (const c of cfg.configs as { name: string; topK: number; chatModel?: string }[]) {
  const run = await openPipeline(name, c.chatModel);
  const records: Rec[] = [];
  for (const q of qs) {
    const t0 = performance.now();
    const o = await run(q.question, c.topK);
    const latencyMs = Math.round(performance.now() - t0);
    let verdict = null;
    if (q.expect === "answer" && !o.refused) verdict = await judge(q.question, q.key_fact ?? "", o.answer);
    if (q.expect === "answer" && o.refused && name === "gemini") verdict = { correct: false, reason: "app refused an answerable question" };
    records.push({ id: q.id, ...o, latencyMs, judge: verdict });
  }
  const meta = { provider: name, config: c, ranAt: new Date().toISOString(), appCommit: commit, questionsFile: "data/questions.jsonl" };
  fs.writeFileSync(path.join("cache", name, `${c.name}.json`), JSON.stringify({ meta, records }, null, 1) + "\n");
  console.log(`${name}/${c.name}: ${records.length} questions saved`);
}
