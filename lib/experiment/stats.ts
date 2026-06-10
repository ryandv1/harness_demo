// Honest frequentist stats for the A/B experiment. No faked numbers — the
// simulator draws real Bernoulli outcomes and these functions evaluate them
// exactly the way an experimentation platform would. Client-safe (pure math).

import type { Comparison, TreatmentResult } from "./types";

/**
 * Standard normal CDF via the Abramowitz & Stegun 7.1.26 erf approximation.
 * Accurate to ~1e-7 — plenty for displaying a p-value.
 */
export function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/**
 * Inverse standard normal CDF (quantile). Beasley-Springer/Moro approximation.
 * Used for z_{alpha/2} and z_{beta} in the sample-size formula.
 */
export function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q: number;
  let r: number;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return (
    -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

/**
 * Required sample size PER ARM to detect `mde` (absolute) at the given baseline
 * rate, two-sided alpha, and power. Standard two-proportion formula.
 */
export function sampleSizePerArm(
  baselineRate: number,
  mde: number,
  alpha: number,
  power: number
): number {
  const p1 = baselineRate;
  const p2 = baselineRate + mde;
  const zAlpha = normalQuantile(1 - alpha / 2);
  const zBeta = normalQuantile(power);
  const pBar = (p1 + p2) / 2;
  const term1 = zAlpha * Math.sqrt(2 * pBar * (1 - pBar));
  const term2 = zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2));
  const n = Math.pow(term1 + term2, 2) / Math.pow(p2 - p1, 2);
  return Math.ceil(n);
}

/**
 * Two-proportion z-test comparing `variant` against `baseline` on conversion
 * rate. Returns lift, z, two-sided p-value, significance, and a 95% CI for the
 * absolute rate difference.
 */
export function compareProportions(
  baseline: TreatmentResult,
  variant: TreatmentResult,
  alpha: number
): Comparison {
  const p1 = baseline.conversionRate;
  const p2 = variant.conversionRate;
  const n1 = baseline.exposures;
  const n2 = variant.exposures;

  // Pooled proportion for the test statistic.
  const pPool = (baseline.conversions + variant.conversions) / (n1 + n2);
  const sefPooled = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));
  const z = sefPooled === 0 ? 0 : (p2 - p1) / sefPooled;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));

  // Unpooled SE for the confidence interval of the difference.
  const seDiff = Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2);
  const zCrit = normalQuantile(1 - alpha / 2);
  const diff = p2 - p1;

  return {
    baseline: baseline.treatment,
    variant: variant.treatment,
    absoluteLift: diff,
    relativeLift: p1 === 0 ? 0 : diff / p1,
    zScore: z,
    pValue,
    significant: pValue < alpha,
    alpha,
    ciLow: diff - zCrit * seDiff,
    ciHigh: diff + zCrit * seDiff,
  };
}
