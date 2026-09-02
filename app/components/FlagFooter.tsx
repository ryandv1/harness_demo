"use client";

import type { FlagEnvironmentInfo, FlagEvaluation } from "@/lib/flags/types";

// Discreet footer listing the FME feature flags evaluated on this page, each with
// its current treatment, plus a badge for which environment's flag versions are live
// (Staging vs Production — or Mock when no live key is configured).
export default function FlagFooter({
  evaluations,
  environment,
}: {
  evaluations: FlagEvaluation[];
  environment: FlagEnvironmentInfo;
}) {
  if (!evaluations.length) return null;

  return (
    <footer className="flag-footer" aria-label="Feature flags in use on this page">
      <span className="flag-footer-label">Flags on this page</span>
      <ul className="flag-footer-list">
        {evaluations.map((e) => (
          <li className="flag-footer-chip" key={e.flag}>
            <code>{e.flag}</code>
            <span className="flag-footer-treatment">{e.treatment}</span>
          </li>
        ))}
      </ul>
      <span
        className={`flag-footer-env env-${environment.kind}`}
        title={`Reading flag definitions from: ${environment.label}`}
      >
        <span className="flag-footer-env-dot" aria-hidden="true" />
        {environment.label}
      </span>
    </footer>
  );
}
