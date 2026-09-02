// Seed event types into FME (Phase 2 Path B — run BEFORE creating metrics).
// ---------------------------------------------------------------------------
// FME only lets you pick an event in the metric-definition dropdown once it has
// seen at least one event of that type. This fires exactly ONE event of each
// event type across BOTH experiments (assistant model choice + mortgage
// application flow) so they all show up in the console immediately — no need
// to run the full hydrator first.
//
// Uses the Split/FME Events ingestion REST API (one bulk POST), per
// https://docs.split.io/reference/create-events :
//   POST https://events.split.io/api/events/bulk
//   Authorization: Bearer <server-side SDK key>   (same key the hydrator uses)
//   Content-Type: application/json
//   body: [ { eventTypeId, trafficTypeName, key, value, timestamp, properties } ]
//
// USAGE (SDK key from .env.local, never committed):
//   npm run seed-events:staging
//   npm run seed-events:prod
//   # preview the payload without sending (no key needed):
//   npx tsx scripts/seed-event-types.ts --env staging --dry-run

import {
  EXPERIMENT_EVENTS,
  EXPERIMENT_EVENT_IDS,
  EXPERIMENT_TRAFFIC_TYPE,
} from "@/lib/experiment/events";
import { MORTGAGE_EVENTS, MORTGAGE_EVENT_IDS } from "@/lib/mortgage/events";

// Both experiments use the same FME traffic type ("user"), so one combined
// bulk POST registers every event type this app tracks in one shot.
const ALL_EVENT_IDS: string[] = [...EXPERIMENT_EVENT_IDS, ...MORTGAGE_EVENT_IDS];

// A single flat literal (previously `1` for every event type) is NOT safe for
// "average value" guardrail metrics: FME apparently doesn't always scope a
// seed key's raw events to the experiment's time window the way it scopes
// impression-based exposures (this key never calls getTreatment(), so it has
// no impression history to bucket it by). Found live 2026-09-01 — a single
// leftover `mortgage_estimated_fee_cents` seed event with value `1` (i.e.
// $0.01, vs. a real range of ~$300–$9,500) blew the "Avg estimated fee ($)"
// guardrail's confidence interval up to an unusable ±186,370% even on a
// freshly re-hydrated, fully-jittered batch. Count-style metrics ("percent of
// keys with event") don't care about magnitude, so `1` stays fine for those;
// average-value metrics need a magnitude in the real ballpark. See D-020 in
// docs/DECISIONS.md and the EXPERIMENT_HYDRATOR.md gotchas section.
const REPRESENTATIVE_VALUE: Record<string, number> = {
  [EXPERIMENT_EVENTS.thumbsUp]: 1, // count-style; magnitude irrelevant
  [EXPERIMENT_EVENTS.latencyMs]: 1_500, // real range ~600–2,600ms
  [EXPERIMENT_EVENTS.costCents]: 0.08, // real range ~0.025–0.17 cents
  [MORTGAGE_EVENTS.applicationSubmitted]: 1, // count-style; magnitude irrelevant
  [MORTGAGE_EVENTS.estimatedFeeCents]: 350_000, // real range ~30,000–950,000¢ ($300–$9,500)
  [MORTGAGE_EVENTS.estimatedLenderRevenueCents]: 700_000, // real range ~270,000–1,395,000¢ ($2,700–$13,950), D-021
  [MORTGAGE_EVENTS.applicationRejected]: 1, // count-style; magnitude irrelevant
};

const EVENTS_BULK_URL = "https://events.split.io/api/events/bulk";

interface Args {
  env: "staging" | "production";
  sdkKeyEnv?: string;
  trafficType: string;
  key: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const map = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const k = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) flags.add(k);
    else {
      map.set(k, next);
      i++;
    }
  }
  const envRaw = (map.get("env") ?? "staging").toLowerCase();
  if (envRaw !== "staging" && envRaw !== "production") {
    throw new Error(`--env must be "staging" or "production" (got "${envRaw}")`);
  }
  return {
    env: envRaw,
    sdkKeyEnv: map.get("sdk-key-env"),
    trafficType: map.get("traffic-type") ?? EXPERIMENT_TRAFFIC_TYPE,
    key: map.get("key") ?? "seed-event-types",
    dryRun: flags.has("dry-run"),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  // First usable env var wins; an unexpanded "${...}" value is ignored.
  const isUsable = (v: string | undefined): v is string =>
    !!v && !v.startsWith("${");
  const candidateKeyEnvs = (
    args.sdkKeyEnv
      ? [args.sdkKeyEnv]
      : args.env === "production"
        ? ["FME_SDK_KEY_PRODUCTION", "FME_SDK_KEY_PROD"]
        : ["FME_SDK_KEY_STAGING", "FME_SDK_KEY_STG"]
  ).concat("FME_SDK_KEY");
  const keyEnvName = candidateKeyEnvs.find((n) => isUsable(process.env[n]));
  const sdkKey = keyEnvName ? process.env[keyEnvName] : undefined;

  const now = Date.now();
  // One event per type. FME only needs *an* event to register the type in the
  // metric-definition dropdown, but average-value guardrail metrics are not
  // safe with an arbitrary placeholder — see REPRESENTATIVE_VALUE above.
  const payload = ALL_EVENT_IDS.map((eventTypeId) => ({
    eventTypeId,
    trafficTypeName: args.trafficType,
    key: args.key,
    value: REPRESENTATIVE_VALUE[eventTypeId] ?? 1,
    timestamp: now,
    properties: { seed: true },
  }));

  console.log("Seed event types → FME");
  console.log(`  env          ${args.env}${args.dryRun ? " (DRY RUN)" : ""}`);
  console.log(`  traffic type ${args.trafficType}`);
  console.log(`  key          ${args.key}`);
  console.log(`  endpoint     POST ${EVENTS_BULK_URL}`);
  console.log("  events:");
  for (const e of payload) console.log(`    - ${e.eventTypeId}`);

  if (args.dryRun) {
    console.log("\nDry run — payload that WOULD be sent:");
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (!sdkKey) {
    console.error(
      `\nERROR: no usable SDK key. Set one of [${candidateKeyEnvs.join(", ")}] in ` +
        `.env.local (an unexpanded "\${...}" value is ignored) and run ` +
        `"npm run seed-events:${args.env === "production" ? "prod" : "staging"}", ` +
        `or pass --dry-run to preview.`
    );
    process.exit(1);
  }

  console.log("\nSending…");
  const res = await fetch(EVENTS_BULK_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sdkKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await res.text();
  if (res.status === 202) {
    console.log("✓ 202 Accepted — event types seeded.");
    console.log(
      "Allow a minute, then in the FME console create the three metrics; all three\n" +
        "event types should now appear in the event dropdown.\n" +
        "Spec: docs/EXPERIMENT_HYDRATOR.md."
    );
  } else {
    console.error(`✗ ${res.status} ${res.statusText}`);
    if (body) console.error(body);
    if (res.status === 403) {
      console.error(
        "403 usually means the wrong key type — use the environment's SERVER-SIDE SDK key, " +
          "not the Admin/MCP key."
      );
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
