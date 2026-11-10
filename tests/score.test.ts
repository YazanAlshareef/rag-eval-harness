import { test } from "node:test";
import assert from "node:assert/strict";
import { citationOk, hit, metrics, rubric, wilson, type Question, type Rec } from "../src/score.ts";

const q = (o: Partial<Question> = {}): Question => ({
  id: "q", type: "answerable", question: "?", expect: "answer",
  expected_doc: "fmla", expected_section: "About FMLA", key_fact: "12 weeks", ...o,
});
const rec = (o: Partial<Rec> = {}): Rec => ({
  id: "q", retrieved: [{ docId: "leave", section: "x", score: 1 }, { docId: "fmla", section: "About FMLA", score: 0.9 }],
  refused: false, answer: "You get 12 weeks [2].", latencyMs: 10, estInputTokens: 1000, estOutputTokens: 100, judge: null, ...o,
});

test("hit finds expected section anywhere in retrieved", () => {
  assert.equal(hit(rec(), q()), true);
  assert.equal(hit(rec({ retrieved: [] }), q()), false);
});
test("citation must point at the expected source and a real passage", () => {
  assert.equal(citationOk(rec(), q()), true);
  assert.equal(citationOk(rec({ answer: "12 weeks [1]." }), q()), false); // cites wrong doc
  assert.equal(citationOk(rec({ answer: "12 weeks [9]." }), q()), false); // invented marker
  assert.equal(citationOk(rec({ answer: "12 weeks." }), q()), false); // no citation
});
test("rubric checks every number, is null without numbers", () => {
  assert.equal(rubric(rec(), q()), true);
  assert.equal(rubric(rec({ answer: "112 weeks [2]" }), q()), false);
  assert.equal(rubric(rec(), q({ key_fact: "up to one year" })), null);
  assert.equal(rubric(rec(), q({ key_fact: "13 days (104 hours)" })), false);
  assert.equal(rubric(rec({ answer: "13 days (104 hours) [2]" }), q({ key_fact: "13 days (104 hours)" })), true);
});
test("metrics: refusal accuracy, hit rate and cost", () => {
  const qs = [q(), q({ id: "r", expect: "refuse", expected_doc: null, expected_section: null, key_fact: null })];
  const recs = [rec(), rec({ id: "r", refused: true, answer: "no", retrieved: [] })];
  const m = metrics(recs, qs, "m", { m: { input: 1, output: 2 } });
  assert.equal(m.refusalAccuracy.rate, 1);
  assert.equal(m.retrievalHit.rate, 1);
  assert.ok(Math.abs(m.estCostUsd! - (2 * (1000 * 1 + 100 * 2)) / 1e6) < 1e-12);
  assert.equal(m.judgeCorrect, null);
});
test("wilson interval is sane", () => {
  const [lo, hi] = wilson(15, 30);
  assert.ok(lo > 0.33 && lo < 0.34 && hi > 0.66 && hi < 0.67);
});

// The app's own `npm run eval` (fixture mode) reports: answered 27, source in top-4 22, cited 20, refused 7.
// The saved topk4 fixture output, scored here, must give the same four counts.
test("harness at k=4 matches the app's own fixture eval numbers", async () => {
  const { readFileSync } = await import("node:fs");
  const qs = readFileSync("data/questions.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Question);
  const { records } = JSON.parse(readFileSync("cache/fixture/topk4.json", "utf8")) as { records: Rec[] };
  const m = metrics(records, qs);
  assert.equal(m.falseRefusal.den - m.falseRefusal.num, 27); // answerable questions that were answered
  assert.equal(m.retrievalHit.num, 22);
  assert.equal(m.citationAccuracy.num, 20);
  assert.equal(m.refusalAccuracy.num, 7);
});
