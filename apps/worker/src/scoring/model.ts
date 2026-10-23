/**
 * Transparent learner for the owner's ratings: four logistic heads (wow, tt, ik, km) over hashed features.
 * The owner's interview rules are the PRIOR; training moves the weights away from it only as far as the ratings justify
 * (L2 pull toward the prior), so with few ratings the model stays close to the rules. Pure and deterministic (no randomness, no clock).
 */
import { hashFeature } from './features';

export const DIM = 4096;
export const HEADS = ['wow', 'tt', 'ik', 'km'] as const;
export type Head = (typeof HEADS)[number];
/** Sparse deltas (bucket -> weight change) relative to the prior, per head. */
export type Weights = Record<Head, Record<number, number>>;

export interface Sample { features: string[]; wow: number; tt: boolean; ik: boolean; km: boolean }
export interface Prediction { wow: number; pWow: number; tt: number; ik: number; km: number; uncertainty: number }

/** Interview rules as feature priors (logit scale). Keys are feature names produced by extractFeatures. */
export const PRIOR: Readonly<Record<Head, Readonly<Record<string, number>>>> = {
  wow: {
    bias: -0.6, 'f:lifestyle': 0.6, 'f:chronic': 0.3, 'f:ai': 0.4, 'f:firstOrBreakthrough': 0.6, 'f:mythBusting': 0.5, 'f:turkey': 0.8,
    'f:rct': 0.4, 'f:metaAnalysis': 0.5, 'f:cohort': 0.3, 'f:animal': -0.8, 'f:regulatory': -0.5, 'f:trade': -0.9, 'f:localSpecific': -1.0,
    'f:outbreak': -0.6, 'f:award': -0.4, 'f:preprint': -1.5, 'f:usPolicy': -1.0, 'f:stopDrug': -1.0, 'f:miracle': -1.0, 'f:evidenceReachable': 0.2,
  },
  tt: {
    bias: -0.3, 'f:drugFocus': 0.5, 'f:guideline': 0.8, 'f:rct': 0.5, 'f:metaAnalysis': 0.5, 'f:cohort': 0.3, 'f:firstOrBreakthrough': 0.5,
    'f:ai': 0.3, 'f:turkey': 0.6, 'f:localSpecific': -0.8, 'f:usPolicy': -0.8, 'f:trade': -0.8,
  },
  ik: {
    bias: -0.8, 'f:lifestyle': 1.3, 'f:chronic': 0.6, 'f:drugFocus': -1.2, 'f:guideline': -0.6, 'f:regulatory': -1.0, 'f:ai': -0.2, 'f:animal': -1.0,
    'f:trade': -1.5, 'f:turkey': 0.4, 'f:mythBusting': 0.4, 'f:localSpecific': -1.0, 'f:usPolicy': -1.2,
  },
  km: {
    bias: -0.4, 'f:ai': 0.5, 'f:firstOrBreakthrough': 0.7, 'f:mythBusting': 0.4, 'f:turkey': 0.6, 'f:rct': 0.3, 'f:lifestyle': 0.2,
    'f:localSpecific': -0.8, 'f:usPolicy': -0.8, 'f:trade': -0.8,
  },
};

const priorIdx: Record<Head, Float64Array> = (() => {
  const out = {} as Record<Head, Float64Array>;
  for (const h of HEADS) {
    const a = new Float64Array(DIM);
    for (const [name, w] of Object.entries(PRIOR[h])) a[hashFeature(name, DIM)] += w;
    out[h] = a;
  }
  return out;
})();

export const emptyWeights = (): Weights => ({ wow: {}, tt: {}, ik: {}, km: {} });
const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

function activeBuckets(features: string[]): number[] {
  return [...new Set(features.map((f) => hashFeature(f, DIM)))];
}
function logit(w: Weights, head: Head, buckets: number[]): number {
  let z = 0;
  const d = w[head];
  for (const b of buckets) z += priorIdx[head][b] + (d[b] ?? 0);
  return z;
}

export function predict(w: Weights, features: string[]): Prediction {
  const buckets = activeBuckets(features);
  const pWow = sigmoid(logit(w, 'wow', buckets));
  const tt = sigmoid(logit(w, 'tt', buckets));
  const ik = sigmoid(logit(w, 'ik', buckets));
  const km = sigmoid(logit(w, 'km', buckets));
  // wow = 1 + 9 p; "worthy" boundary is wow 6, i.e. p = 5/9. Uncertainty is highest when the heads sit near their decision boundaries.
  const uWow = 1 - Math.min(1, Math.abs(pWow - 5 / 9) / (4 / 9));
  const uCh = [tt, ik, km].map((p) => 1 - Math.abs(2 * p - 1));
  return { wow: 1 + 9 * pWow, pWow, tt, ik, km, uncertainty: (uWow + uCh[0] + uCh[1] + uCh[2]) / 4 };
}

export interface TrainOptions { epochs?: number; lr?: number; l2?: number }

export function train(samples: Sample[], opts: TrainOptions = {}): Weights {
  const epochs = opts.epochs ?? 40;
  const lr0 = opts.lr ?? 0.5;
  const l2 = opts.l2 ?? 0.02;
  const w = emptyWeights();
  if (!samples.length) return w;
  const prepared = samples.map((s) => ({ buckets: activeBuckets(s.features), y: { wow: (Math.min(10, Math.max(1, s.wow)) - 1) / 9, tt: s.tt ? 1 : 0, ik: s.ik ? 1 : 0, km: s.km ? 1 : 0 } as Record<Head, number> }));
  for (let e = 0; e < epochs; e++) {
    const lr = lr0 / (1 + 0.05 * e);
    for (const s of prepared) {
      const scale = 1 / Math.sqrt(s.buckets.length);
      for (const h of HEADS) {
        const p = sigmoid(logit(w, h, s.buckets));
        const g = (p - s.y[h]) * scale;
        const d = w[h];
        for (const b of s.buckets) d[b] = (d[b] ?? 0) - lr * (g + l2 * (d[b] ?? 0));
      }
    }
  }
  for (const h of HEADS) for (const k of Object.keys(w[h])) if (Math.abs(w[h][Number(k)]) < 1e-4) delete w[h][Number(k)];
  return w;
}

export interface Metrics {
  n: number;
  /** Cross-validated (5 folds) when n >= 10, otherwise `insufficient`. */
  insufficient?: boolean;
  maeWow: number;
  worthyAcc: number;
  channelAcc: Record<'tt' | 'ik' | 'km', number>;
  channelF1: Record<'tt' | 'ik' | 'km', number>;
  /** Same measures for the rules-only prior on all samples, to show what the ratings added. */
  baseline: { maeWow: number; worthyAcc: number; channelAcc: Record<'tt' | 'ik' | 'km', number> };
}

function f1(tp: number, fp: number, fn: number): number { return tp === 0 ? 0 : (2 * tp) / (2 * tp + fp + fn); }

function measure(pred: Array<{ p: Prediction; s: Sample }>): { maeWow: number; worthyAcc: number; channelAcc: Record<'tt' | 'ik' | 'km', number>; channelF1: Record<'tt' | 'ik' | 'km', number> } {
  const n = pred.length || 1;
  let mae = 0, worthy = 0;
  const acc = { tt: 0, ik: 0, km: 0 }, tp = { tt: 0, ik: 0, km: 0 }, fp = { tt: 0, ik: 0, km: 0 }, fn = { tt: 0, ik: 0, km: 0 };
  for (const { p, s } of pred) {
    mae += Math.abs(p.wow - s.wow);
    if ((p.wow >= 6) === (s.wow >= 6)) worthy++;
    for (const c of ['tt', 'ik', 'km'] as const) {
      const yes = p[c] > 0.5, truth = s[c];
      if (yes === truth) acc[c]++;
      if (yes && truth) tp[c]++; else if (yes && !truth) fp[c]++; else if (!yes && truth) fn[c]++;
    }
  }
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return {
    maeWow: r(mae / n), worthyAcc: r(worthy / n),
    channelAcc: { tt: r(acc.tt / n), ik: r(acc.ik / n), km: r(acc.km / n) },
    channelF1: { tt: r(f1(tp.tt, fp.tt, fn.tt)), ik: r(f1(tp.ik, fp.ik, fn.ik)), km: r(f1(tp.km, fp.km, fn.km)) },
  };
}

export function evaluate(samples: Sample[], opts: TrainOptions = {}): Metrics {
  const base = measure(samples.map((s) => ({ s, p: predict(emptyWeights(), s.features) })));
  const baseline = { maeWow: base.maeWow, worthyAcc: base.worthyAcc, channelAcc: base.channelAcc };
  if (samples.length < 10) return { n: samples.length, insufficient: true, ...base, baseline };
  const k = 5;
  const held: Array<{ p: Prediction; s: Sample }> = [];
  for (let fold = 0; fold < k; fold++) {
    const trainSet = samples.filter((_, i) => i % k !== fold);
    const w = train(trainSet, opts);
    for (let i = fold; i < samples.length; i += k) held.push({ s: samples[i], p: predict(w, samples[i].features) });
  }
  return { n: samples.length, ...measure(held), baseline };
}

/** The strongest named reasons (flags and sources) behind a prediction's wow score, for the Hub: top positives and top negatives. */
export function topReasons(w: Weights, features: string[]): { up: string[]; down: string[] } {
  const named = [...new Set(features.filter((f) => f.startsWith('f:') || f.startsWith('src:')))];
  const scored = named.map((f) => { const b = hashFeature(f, DIM); return { f, v: priorIdx.wow[b] + (w.wow[b] ?? 0) }; });
  const up = scored.filter((s) => s.v > 0.15).sort((a, b) => b.v - a.v).slice(0, 3).map((s) => s.f);
  const down = scored.filter((s) => s.v < -0.15).sort((a, b) => a.v - b.v).slice(0, 2).map((s) => s.f);
  return { up, down };
}

export const serializeWeights = (w: Weights): string => JSON.stringify(w);
export function parseWeights(json: string | null | undefined): Weights {
  const out = emptyWeights();
  if (!json) return out;
  try {
    const raw = JSON.parse(json) as Record<string, Record<string, number>>;
    for (const h of HEADS) for (const [k, v] of Object.entries(raw[h] ?? {})) if (Number.isFinite(v)) out[h][Number(k)] = v;
  } catch { /* corrupt weights: fall back to the prior */ }
  return out;
}
