"use client";

import type { FlagEvaluation, FlagMode } from "@/lib/flags/types";
import { FLAG_DEFS } from "@/lib/flags/flags";
import InfoTip from "./InfoTip";

export default function DemoPanel({
  mode,
  evaluations,
  onToggle,
}: {
  mode: FlagMode;
  evaluations: FlagEvaluation[];
  onToggle: (flag: string, treatment: string) => void;
}) {
  const byFlag = new Map(evaluations.map((e) => [e.flag, e]));
  const isLive = mode === "fme";

  return (
    <div className="card demo-panel">
      <h2>
        FME Demo Panel
        <span className={`pill ${isLive ? "premium" : ""}`}>
          {isLive ? "live FME" : "mock"}
        </span>
      </h2>

      {FLAG_DEFS.map((def) => {
        const ev = byFlag.get(def.key);
        const current = ev?.treatment ?? def.default;
        return (
          <div className="flag-row" key={def.key}>
            <div className="flag-head">
              <span className="flag-key">{def.label}</span>
              {ev && (
                <InfoTip
                  placement="right"
                  className="flag-latency"
                  tip="Time to evaluate this flag locally, in microseconds (µs). The FME SDK keeps targeting rules cached in memory, so a check is an in-process lookup — no network round-trip. That's why it's measured in microseconds, not milliseconds."
                >
                  {ev.latencyMicros} µs
                  <span className="infotip-mark" aria-hidden="true">
                    i
                  </span>
                </InfoTip>
              )}
            </div>
            <div className="flag-desc">{def.describe(current)}</div>
            <div className="treatments">
              {def.treatments.map((t) => (
                <button
                  key={t}
                  className={`treatment ${t === current ? "active" : ""}`}
                  disabled={isLive}
                  onClick={() => onToggle(def.key, t)}
                  title={isLive ? "Change this in the Harness FME UI" : `Set to "${t}"`}
                >
                  {t}
                </button>
              ))}
            </div>
            {ev?.config && <DynamicConfig json={ev.config} />}
          </div>
        );
      })}

      <div className="demo-note">
        {isLive
          ? "Live FME — change these flags in the Harness FME UI; streaming updates land here in ~real time."
          : "Mock mode — toggle treatments to simulate flipping flags in Harness FME. Add an FME_SDK_KEY to go live."}
      </div>
    </div>
  );
}

// Renders a treatment's Dynamic Configuration (FME treatment "configurations" JSON).
// These values drive the assistant at runtime and can be edited in FME with no redeploy.
function DynamicConfig({ json }: { json: string }) {
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(json);
  } catch {
    parsed = null;
  }
  return (
    <div className="dynamic-config">
      <span className="dynamic-config-label">Dynamic Configuration</span>
      {parsed ? (
        <dl className="dynamic-config-grid">
          {Object.entries(parsed).map(([k, v]) => (
            <div className="dynamic-config-item" key={k}>
              <dt>{k}</dt>
              <dd>{String(v)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <pre className="dynamic-config-raw">{json}</pre>
      )}
    </div>
  );
}
