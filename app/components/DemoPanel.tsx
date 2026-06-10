"use client";

import type { FlagEvaluation, FlagMode } from "@/lib/flags/types";
import { FLAG_DEFS } from "@/lib/flags/flags";

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
                <span className="flag-latency" title="Local flag-evaluation time">
                  {ev.latencyMicros} µs
                </span>
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
