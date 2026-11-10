// Pure scoring functions. No network, no files. Everything the report shows comes from here.

export type Question = {
  id: string;
  type: "answerable" | "unanswerable" | "tricky";
  question: string;
  expect: "answer" | "refuse";
  expected_doc: string | null;
  expected_section: string | null;
  key_fact: string | null;
};

export type Rec = {
  id: string;
  retrieved: { docId: string; section: string; score: number }[];
  refused: boolean;
  answer: string;
  latencyMs: number;
  estInputTokens: number; // chars / 4, an estimate, not a billing number
  estOutputTokens: number;
  judge: { correct: boolean; reason: string } | null; // null = judge not run
};

export type Rate = { num: number; den: number; rate: number | null; ci: [number, number] | null };

export function rate(num: number, den: number): Rate {
  if (den === 0) return { num, den, rate: null, ci: null };
  return { num, den, rate: num / den, ci: wilson(num, den) };
}

// 95% Wilson interval. With n=30 it is wide: that is the point of showing it.
export function wilson(k: number, n: number): [number, number] {
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
}

export function sourceMatches(
  c: { docId: string; section: string },
  q: Pick<Question, "expected_doc" | "expected_section">,
): boolean {
  return c.docId === q.expected_doc && c.section.toLowerCase().includes((q.expected_section ?? "").toLowerCase());
}

export const hit = (r: Rec, q: Question) => q.expect === "answer" && r.retrieved.some((c) => sourceMatches(c, q));

export function citedNumbers(answer: string): number[] {
  return [...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
}

// Citation is accurate when the answer cites at least one passage, every [n] points at a
// passage that was really retrieved, and at least one cited passage is the expected source.
export function citationOk(r: Rec, q: Question): boolean {
  if (q.expect !== "answer" || r.refused) return false;
  const ns = citedNumbers(r.answer);
  if (!ns.length || ns.some((n) => n < 1 || n > r.retrieved.length)) return false;
  return ns.some((n) => sourceMatches(r.retrieved[n - 1], q));
}

// Rubric: every number in key_fact must appear in the answer. null = key_fact has no number,
// so the rubric cannot judge it (only the LLM judge / a human can).
export function rubric(r: Rec, q: Question): boolean | null {
  if (q.expect !== "answer") return null;
  const nums = (q.key_fact ?? "").replace(/(\d),(\d)/g, "$1$2").match(/\d+/g);
  if (!nums) return null;
  const a = r.answer.replace(/(\d),(\d)/g, "$1$2");
  return !r.refused && nums.every((n) => new RegExp(`(?<![\\d.])${n}(?![\\d])`).test(a));
}

export type Pricing = Record<string, { input: number; output: number }>;

export function cost(recs: Rec[], model: string | undefined, pricing: Pricing | undefined): number | null {
  const p = model && pricing?.[model];
  if (!p) return null;
  return recs.reduce((s, r) => s + (r.estInputTokens * p.input + r.estOutputTokens * p.output) / 1e6, 0);
}

export function percentile(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}

export function metrics(recs: Rec[], qs: Question[], model?: string, pricing?: Pricing) {
  const byId = new Map(recs.map((r) => [r.id, r]));
  const pairs = qs.map((q) => ({ q, r: byId.get(q.id) })).filter((x): x is { q: Question; r: Rec } => !!x.r);
  const ans = pairs.filter((x) => x.q.expect === "answer");
  const ref = pairs.filter((x) => x.q.expect === "refuse");
  const rub = ans.map((x) => rubric(x.r, x.q)).filter((v): v is boolean => v !== null);
  const judged = ans.filter((x) => x.r.judge);
  const lat = recs.map((r) => r.latencyMs);
  return {
    questions: pairs.length,
    retrievalHit: rate(ans.filter((x) => hit(x.r, x.q)).length, ans.length),
    rubricPass: rate(rub.filter(Boolean).length, rub.length),
    judgeCorrect:
      judged.length === ans.length && ans.length > 0
        ? rate(ans.filter((x) => x.r.judge!.correct && !x.r.refused).length, ans.length)
        : null,
    citationAccuracy: rate(ans.filter((x) => citationOk(x.r, x.q)).length, ans.filter((x) => !x.r.refused).length),
    refusalAccuracy: rate(ref.filter((x) => x.r.refused).length, ref.length),
    falseRefusal: rate(ans.filter((x) => x.r.refused).length, ans.length),
    latencyMs: lat.length ? { median: percentile(lat, 50), p95: percentile(lat, 95) } : null,
    estCostUsd: cost(recs, model, pricing),
  };
}
