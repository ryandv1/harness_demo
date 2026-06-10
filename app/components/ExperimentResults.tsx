"use client";

import { useCallback, useEffect, useState } from "react";
import type { ExperimentResult } from "@/lib/experiment/types";

const SOURCE_LABEL: Record<ExperimentResult["source"], string> = {
  fixtures: "pre-baked",
  live: "live",
  blended: "live + baked",
};

function pct(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}

function formatP(p: number): string {
  if (p < 0.001) return "p < 0.001";
  return `p = ${p.toFixed(3)}`;
}

export default function ExperimentResults({ refreshKey = 0 }: { refreshKey?: number }) {
  const [result, setResult] = useState<ExperimentResult | null>(null);

  const load = useCallback(() => {
    fetch("/api/experiment")
      .then((r) => r.json())
      .then(setResult)
      .catch(() => setResult(null));
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (!result) {
    return (
      <div className="card">
        <h2>Experiment</h2>
        <div className="demo-note">Loading results…</div>
      </div>
    );
  }

  const { comparison: c } = result;
  const variant = result.treatments.find((t) => t.treatment === c.variant);
  const baseline = result.treatments.find((t) => t.treatment === c.baseline);
  const winner = c.absoluteLift >= 0 ? c.variant : c.baseline;
  const costRatio =
    baseline && variant && baseline.avgCostCents > 0
      ? variant.avgCostCents / baseline.avgCostCents
      : null;

  return (
    <div className="card experiment">
      <h2>
        Experiment
        <span className={`pill ${result.source !== "fixtures" ? "premium" : ""}`}>
          {SOURCE_LABEL[result.source]}
        </span>
      </h2>

      <div className="exp-head">
        <div className="exp-name">{result.name}</div>
        <div className="exp-sub">
          Primary metric: {result.metric} · {result.totalExposures.toLocaleString()}{" "}
          exposures (target ≥ {result.requiredSamplePerArm.toLocaleString()}/arm)
        </div>
      </div>

      <table className="exp-table">
        <thead>
          <tr>
            <th>Treatment</th>
            <th>{result.metric}</th>
            <th>Avg latency</th>
            <th>Avg cost</th>
            <th>n</th>
          </tr>
        </thead>
        <tbody>
          {result.treatments.map((t) => (
            <tr key={t.treatment} className={t.treatment === winner ? "winner" : ""}>
              <td className="t-name">
                {t.treatment}
                {t.treatment === winner && <span className="tag">winner</span>}
              </td>
              <td className="t-rate">{pct(t.conversionRate)}</td>
              <td>{t.avgLatencyMs.toLocaleString()} ms</td>
              <td>{t.avgCostCents}¢</td>
              <td className="t-n">{t.exposures.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={`exp-verdict ${c.significant ? "sig" : "ns"}`}>
        <span className="verdict-badge">
          {c.significant ? "Statistically significant" : "Not yet significant"}
        </span>
        <span className="verdict-detail">
          {c.variant} lifts {result.metric} by{" "}
          <strong>
            {c.absoluteLift >= 0 ? "+" : ""}
            {(c.absoluteLift * 100).toFixed(1)} pts
          </strong>{" "}
          ({c.relativeLift >= 0 ? "+" : ""}
          {pct(c.relativeLift)} relative) · {formatP(c.pValue)} · 95% CI [
          {(c.ciLow * 100).toFixed(1)}, {(c.ciHigh * 100).toFixed(1)}] pts
        </span>
      </div>

      {costRatio && (
        <div className="exp-tradeoff">
          ⚖️ Trade-off: {c.variant} wins on satisfaction but costs{" "}
          <strong>{costRatio.toFixed(1)}×</strong> more per response. That&apos;s the
          flags + attribution + experimentation story in one tool.
        </div>
      )}

      <div className="demo-note">
        {result.source === "fixtures"
          ? "Pre-baked from a seeded traffic simulator (audible-ready). Rate an assistant reply 👍/👎 to blend live feedback into these numbers."
          : "Live thumbs-up/down feedback is blended on top of the simulated baseline. In live FME, results persist — never hit Re-calculate after 90 days (raw events are purged)."}
      </div>
    </div>
  );
}
