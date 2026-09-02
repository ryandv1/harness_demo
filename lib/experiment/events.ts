// Single source of truth for the FME event types the experiment emits.
// Used by BOTH the seeder (scripts/seed-event-types.ts — fires one of each so the
// types appear in the metric-definition dropdown) and the hydrator
// (scripts/experiment-hydrator.ts — sends the full traffic). Keep names in sync
// with the metrics you create in the FME console (docs/EXPERIMENT_HYDRATOR.md).

export const EXPERIMENT_TRAFFIC_TYPE = "user";

// eventTypeId rules (Split/FME): start alphanumeric, then [-_.a-zA-Z0-9], ≤80 chars.
export const EXPERIMENT_EVENTS = {
  /** Primary conversion metric: "percent of unique keys with event". */
  thumbsUp: "assistant_thumbs_up",
  /** Guardrail: average value per key. */
  latencyMs: "assistant_response_latency_ms",
  /** Guardrail: average value per key. */
  costCents: "assistant_response_cost_cents",
} as const;

export type ExperimentEventId =
  (typeof EXPERIMENT_EVENTS)[keyof typeof EXPERIMENT_EVENTS];

export const EXPERIMENT_EVENT_IDS: ExperimentEventId[] =
  Object.values(EXPERIMENT_EVENTS);
