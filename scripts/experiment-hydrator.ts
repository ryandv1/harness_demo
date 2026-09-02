// Experiment Hydrator (Phase 2, Path B — live FME)
// ---------------------------------------------------------------------------
// Drives REAL traffic into Harness FME so the experiment shows results inside
// FME's Experimentation view (not just the in-app dashboard). For each synthetic
// `user` key it:
//   1. calls getTreatment(key, flag) → emits an IMPRESSION (who saw what treatment).
//      DEFAULT split mode = "percentage": send NO attributes so each key falls to the
//      flag's default rule, which is a 50/50 haiku/sonnet percentage split. This is
//      what a streaming FME *experiment* targets (the experiment requires a rule with
//      a percentage distribution), so impressions land in the experiment's rule.
//      Opt-in `--split-mode tier` instead tags ~`premiumShare` of keys tier=premium to
//      drive the split via the flag's tier rule (premium→sonnet); use only when NOT
//      running a formal experiment, since those impressions attribute to the tier rule.
//   2. draws outcomes from each arm's GROUND TRUTH (lib/experiment/config.ts:
//      haiku 62% / sonnet 72% thumbs-up, ~3x cost) and tracks three events:
//        assistant_thumbs_up           (value 1, only when "converted")
//        assistant_response_latency_ms (value = sampled ms)
//        assistant_response_cost_cents (value = per-response cost)
//   3. destroy() flushes pending impressions + events to FME.
//
// FME then attributes events to the treatment each key was shown and computes the
// metric impact + statistical significance. You define the three metrics in the
// FME console (see docs/EXPERIMENT_HYDRATOR.md for the exact spec).
//
// Repeatable across environments. Each run uses a fresh key namespace
// (hydrate-<env>-<runId>-...) so runs don't pollute each other's key history.
//
// --experiment selects WHICH experiment to hydrate (default "assistant" — the
// AI model choice, described above). Pass --experiment mortgage to instead
// hydrate exp_mortgage_applicationFlow_web (singleScreen vs. twoPage): every
// synthetic key is exposed (impression, no attributes → falls to the 50/50
// default rule — riley/jordan's individual-key rules never fire for synthetic
// keys), a fraction "submits" per lib/mortgage/experiment.ts's ground truth,
// and each submitter tracks mortgage_application_submitted (value 1),
// mortgage_estimated_fee_cents (the real borrower-facing fee, computed via
// the same lib/mortgage/fees.ts formula the live route uses),
// mortgage_estimated_lender_revenue_cents (hydrator-only yield-spread-premium
// revenue model, D-021), and — for a fraction of submitters —
// mortgage_application_rejected (value 1).
//
// USAGE (SDK key comes from .env.local, never committed):
//   npm run hydrate:staging -- --users 6000 --seed 42
//   npm run hydrate:prod    -- --users 6000 --seed 42
//   npm run hydrate:staging -- --experiment mortgage --users 4000 --seed 7
//   # preview without contacting FME (no key needed):
//   npx tsx scripts/experiment-hydrator.ts --env staging --dry-run
//   npx tsx scripts/experiment-hydrator.ts --env staging --experiment mortgage --dry-run
//
// This is a maintainer/demo utility — cloners never need it (tsx is a devDep).

import { SplitFactory } from "@splitsoftware/splitio";
import { AI_MODEL_EXPERIMENT } from "@/lib/experiment/config";
import { FLAGS } from "@/lib/flags/flags";
import type { TreatmentModel } from "@/lib/experiment/types";
import { mulberry32, hashUnit } from "@/lib/sim/rng";
import { EXPERIMENT_EVENTS as EVENTS } from "@/lib/experiment/events";
import { MORTGAGE_FLOW_EXPERIMENT, sampleMortgageSubmission } from "@/lib/mortgage/experiment";
import { MORTGAGE_EVENTS } from "@/lib/mortgage/events";

interface Args {
  env: "staging" | "production";
  experiment: "assistant" | "mortgage";
  sdkKeyEnv?: string;
  flag: string;
  trafficType: string;
  users: number;
  seed: number;
  splitMode: "percentage" | "tier";
  premiumShare: number;
  runId: string;
  readyTimeout: number;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const map = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      flags.add(key);
    } else {
      map.set(key, next);
      i++;
    }
  }

  const envRaw = (map.get("env") ?? "staging").toLowerCase();
  if (envRaw !== "staging" && envRaw !== "production") {
    throw new Error(`--env must be "staging" or "production" (got "${envRaw}")`);
  }

  const splitRaw = (map.get("split-mode") ?? "percentage").toLowerCase();
  if (splitRaw !== "percentage" && splitRaw !== "tier") {
    throw new Error(`--split-mode must be "percentage" or "tier" (got "${splitRaw}")`);
  }

  const experimentRaw = (map.get("experiment") ?? "assistant").toLowerCase();
  if (experimentRaw !== "assistant" && experimentRaw !== "mortgage") {
    throw new Error(`--experiment must be "assistant" or "mortgage" (got "${experimentRaw}")`);
  }

  return {
    env: envRaw,
    experiment: experimentRaw,
    sdkKeyEnv: map.get("sdk-key-env"),
    flag:
      map.get("flag") ??
      (experimentRaw === "mortgage" ? FLAGS.MORTGAGE_APPLICATION_FLOW : FLAGS.AI_MODEL),
    trafficType: map.get("traffic-type") ?? "user",
    users: Number(map.get("users") ?? 6000),
    seed: Number(map.get("seed") ?? 42),
    splitMode: splitRaw,
    premiumShare: Number(map.get("premium-share") ?? 0.5),
    runId: map.get("run-id") ?? Date.now().toString(36),
    readyTimeout: Number(map.get("ready-timeout") ?? 15),
    dryRun: flags.has("dry-run"),
  };
}

interface Acc {
  exposures: number;
  conversions: number;
  latencySum: number;
  costSum: number;
}

interface MortgageAcc {
  exposures: number;
  submissions: number;
  feeSum: number;
  revenueSum: number;
  rejections: number;
}

/** Assistant model-choice experiment: haiku vs. sonnet, 3 events per exposure. */
function hydrateAssistant(args: Args, client: any, keyPrefix: string): void {
  const config = AI_MODEL_EXPERIMENT;
  const modelByTreatment = new Map<string, TreatmentModel>(
    config.models.map((m) => [m.treatment, m])
  );
  const rand = mulberry32(args.seed);
  const acc = new Map<string, Acc>();
  let unmatched = 0;
  let trackFailures = 0;

  for (let i = 0; i < args.users; i++) {
    const key = `${keyPrefix}-user-${i}`;

    // Treatment comes from FME's real rules (impression emitted here). In dry run,
    // approximate the allocation locally so the preview is representative.
    let treatment: string;
    if (args.splitMode === "tier") {
      // Force the split via the flag's tier rule (premium→sonnet, else haiku).
      const isPremium = hashUnit(key) < args.premiumShare;
      treatment = client
        ? (client.getTreatment(key, args.flag, { tier: isPremium ? "premium" : "free" }) as string)
        : isPremium
          ? "sonnet"
          : "haiku";
    } else {
      // Percentage mode: no attributes → key falls to the 50/50 default rule and
      // FME's own hashing assigns the treatment (what the experiment measures).
      treatment = client
        ? (client.getTreatment(key, args.flag) as string)
        : hashUnit(key) < 0.5
          ? "haiku"
          : "sonnet"; // dry-run approximation only; live uses FME's bucketing
    }

    const model = modelByTreatment.get(treatment);
    if (!model) {
      unmatched++;
      continue;
    }

    const a =
      acc.get(treatment) ??
      (acc.set(treatment, {
        exposures: 0,
        conversions: 0,
        latencySum: 0,
        costSum: 0,
      }),
      acc.get(treatment)!);

    a.exposures += 1;

    // Outcomes drawn from this arm's ground truth.
    const converted = rand() < model.trueConversionRate;
    const latency = Math.round(
      model.latencyMs.mean + (rand() * 2 - 1) * model.latencyMs.jitter
    );
    // Per-response cost varies with token count. Sample uniform ± costJitterCents
    // so the live metric has within-arm variance (FME can't compute significance
    // on a zero-variance metric). Mean is unchanged at model.costCents.
    const costJitter = model.costJitterCents ?? 0;
    const cost = Number(
      (model.costCents + (rand() * 2 - 1) * costJitter).toFixed(4)
    );

    if (converted) a.conversions += 1;
    a.latencySum += latency;
    a.costSum += cost;

    if (client) {
      const tt = args.trafficType;
      if (!client.track(key, tt, EVENTS.latencyMs, latency)) trackFailures++;
      if (!client.track(key, tt, EVENTS.costCents, cost)) trackFailures++;
      if (converted && !client.track(key, tt, EVENTS.thumbsUp, 1)) trackFailures++;
    }

    if ((i + 1) % 1000 === 0) {
      console.log(`  …${i + 1}/${args.users}`);
    }
  }

  // --- Report ---
  console.log("\nAllocation + simulated outcomes:");
  for (const t of config.models.map((m) => m.treatment)) {
    const a = acc.get(t);
    if (!a) {
      console.log(`  ${t.padEnd(7)} (no exposures)`);
      continue;
    }
    const rate = a.exposures ? (a.conversions / a.exposures) * 100 : 0;
    const lat = a.exposures ? Math.round(a.latencySum / a.exposures) : 0;
    const cost = a.exposures ? (a.costSum / a.exposures).toFixed(4) : "0";
    console.log(
      `  ${t.padEnd(7)} n=${String(a.exposures).padStart(5)}  ` +
        `thumbs-up ${rate.toFixed(1)}%  lat ${lat}ms  cost ${cost}¢`
    );
  }
  if (unmatched > 0) {
    console.log(
      `  ⚠ ${unmatched} key(s) got a treatment outside {${config.models
        .map((m) => m.treatment)
        .join(", ")}} (e.g. "control") — check the flag is live in this env.`
    );
  }
  if (trackFailures > 0) {
    console.log(`  ⚠ ${trackFailures} track() call(s) were not queued.`);
  }
}

/** Mortgage application-flow experiment: singleScreen vs. twoPage. Everyone is
 * exposed (impression); a fraction "submits" per ground truth and tracks the
 * conversion + fee-value events, mirroring app/api/mortgage/apply/route.ts. */
function hydrateMortgage(args: Args, client: any, keyPrefix: string): void {
  const config = MORTGAGE_FLOW_EXPERIMENT;
  const modelByTreatment = new Map(config.models.map((m) => [m.treatment, m]));
  const rand = mulberry32(args.seed);
  const acc = new Map<string, MortgageAcc>();
  let unmatched = 0;
  let trackFailures = 0;

  for (let i = 0; i < args.users; i++) {
    const key = `${keyPrefix}-user-${i}`;

    // No attributes → falls to the 50/50 default rule (riley/jordan's individual-
    // key rules only match those two literal keys, never these synthetic ones).
    const treatment: string = client
      ? (client.getTreatment(key, args.flag) as string)
      : hashUnit(key) < 0.5
        ? "singleScreen"
        : "twoPage"; // dry-run approximation only; live uses FME's bucketing

    const model = modelByTreatment.get(treatment);
    if (!model) {
      unmatched++;
      continue;
    }

    const a =
      acc.get(treatment) ??
      (acc.set(treatment, {
        exposures: 0,
        submissions: 0,
        feeSum: 0,
        revenueSum: 0,
        rejections: 0,
      }),
      acc.get(treatment)!);

    a.exposures += 1;

    const submitted = rand() < model.submissionRate;
    if (submitted) {
      const { feeCents, lenderRevenueCents } = sampleMortgageSubmission(model, rand);
      // Add synthetic per-submission spread on top of the real fee before
      // tracking — computeEstimatedFeeCents's flat-fee branch returns an
      // exact constant, which otherwise leaves a large point-mass of
      // identical values in each arm and blows up the guardrail metric's
      // confidence interval in FME (see feeJitterCents comment in
      // lib/mortgage/experiment.ts). Mean is unaffected; only reported and
      // tracked here, never in the real quoted fee. lenderRevenueCents
      // already varies continuously with loan amount on both pricing
      // branches (D-021), so it needs no equivalent jitter.
      const feeJitter = config.feeJitterCents ?? 0;
      const jitteredFeeCents = Math.max(
        0,
        Math.round(feeCents + (rand() * 2 - 1) * feeJitter)
      );
      a.submissions += 1;
      a.feeSum += jitteredFeeCents;
      a.revenueSum += lenderRevenueCents;

      // Rejection is conditional on submission, but TRACKED unconditionally
      // over all exposed keys (non-submitters simply never fire the event) —
      // "percent of unique keys with event" over the full exposure
      // population, mirroring applicationSubmitted's shape rather than
      // estimatedFeeCents's, specifically to avoid D-020's low-participation
      // CI-instability failure mode. See rejectionRate comment on
      // MortgageTreatmentModel.
      const rejected = rand() < model.rejectionRate;
      if (rejected) a.rejections += 1;

      if (client) {
        const tt = args.trafficType;
        if (!client.track(key, tt, MORTGAGE_EVENTS.applicationSubmitted, 1))
          trackFailures++;
        if (!client.track(key, tt, MORTGAGE_EVENTS.estimatedFeeCents, jitteredFeeCents))
          trackFailures++;
        if (!client.track(key, tt, MORTGAGE_EVENTS.estimatedLenderRevenueCents, lenderRevenueCents))
          trackFailures++;
        if (rejected && !client.track(key, tt, MORTGAGE_EVENTS.applicationRejected, 1))
          trackFailures++;
      }
    }

    if ((i + 1) % 1000 === 0) {
      console.log(`  …${i + 1}/${args.users}`);
    }
  }

  // --- Report ---
  console.log("\nAllocation + simulated outcomes:");
  for (const t of config.models.map((m) => m.treatment)) {
    const a = acc.get(t);
    if (!a) {
      console.log(`  ${t.padEnd(11)} (no exposures)`);
      continue;
    }
    const rate = a.exposures ? (a.submissions / a.exposures) * 100 : 0;
    const avgFeeCents = a.submissions ? a.feeSum / a.submissions : 0;
    const avgRevenueCents = a.submissions ? a.revenueSum / a.submissions : 0;
    const rejectionRate = a.exposures ? (a.rejections / a.exposures) * 100 : 0;
    console.log(
      `  ${t.padEnd(11)} n=${String(a.exposures).padStart(5)}  ` +
        `submitted ${rate.toFixed(1)}%  avg fee $${(avgFeeCents / 100).toFixed(2)}  ` +
        `avg revenue $${(avgRevenueCents / 100).toFixed(2)}  rejected ${rejectionRate.toFixed(2)}%`
    );
  }
  if (unmatched > 0) {
    console.log(
      `  ⚠ ${unmatched} key(s) got a treatment outside {${config.models
        .map((m) => m.treatment)
        .join(", ")}} (e.g. "control") — check the flag is live in this env.`
    );
  }
  if (trackFailures > 0) {
    console.log(`  ⚠ ${trackFailures} track() call(s) were not queued.`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Resolve the SDK key for the chosen environment. Accepted env-var names (first
  // usable one wins): the explicit --sdk-key-env, then the per-env names (both the
  // long and short spellings), then a generic FME_SDK_KEY fallback.
  // Treat an unexpanded "${VAR}" reference as missing: `--env-file`/`node --env-file`
  // don't expand ${...}, and a literal placeholder would otherwise be passed to the
  // SDK as a bogus key — which never authenticates and HANGS instead of failing.
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

  const keyPrefix = `hydrate-${args.env}-${args.runId}`;

  console.log("Experiment Hydrator");
  console.log(`  env           ${args.env}${args.dryRun ? " (DRY RUN)" : ""}`);
  console.log(`  flag          ${args.flag}`);
  console.log(`  traffic type  ${args.trafficType}`);
  console.log(`  users         ${args.users}`);
  console.log(`  seed          ${args.seed}`);
  console.log(
    `  split mode    ${args.splitMode}` +
      (args.splitMode === "percentage"
        ? " (FME default-rule 50/50 split — for the experiment)"
        : ` (tier=premium for ${args.premiumShare} of keys → sonnet via tier rule)`)
  );
  console.log(`  key namespace ${keyPrefix}-user-<i>`);
  console.log(
    args.experiment === "mortgage"
      ? `  events        ${MORTGAGE_EVENTS.applicationSubmitted}, ${MORTGAGE_EVENTS.estimatedFeeCents}, ` +
        `${MORTGAGE_EVENTS.estimatedLenderRevenueCents}, ${MORTGAGE_EVENTS.applicationRejected}`
      : `  events        ${EVENTS.thumbsUp}, ${EVENTS.latencyMs}, ${EVENTS.costCents}`
  );

  if (!args.dryRun && !sdkKey) {
    console.error(
      `\nERROR: no usable SDK key found. Set one of [${candidateKeyEnvs.join(", ")}] ` +
        `in .env.local (an unexpanded "\${...}" value is ignored) and run via ` +
        `"npm run hydrate:${args.env === "production" ? "prod" : "staging"}", ` +
        `or pass --dry-run to preview without contacting FME.`
    );
    process.exit(1);
  }

  // --- Connect (live only) ---
  let client: any = null;
  if (!args.dryRun) {
    const factory = (SplitFactory as any)({
      core: { authorizationKey: sdkKey },
      startup: { readyTimeout: args.readyTimeout },
    });
    client = factory.client();
    console.log("\nWaiting for SDK ready…");
    await client.ready();
    console.log("SDK ready. Sending traffic…");
  } else {
    console.log("\nDry run — simulating allocation locally, nothing sent to FME.");
  }

  if (args.experiment === "mortgage") {
    hydrateMortgage(args, client, keyPrefix);
  } else {
    hydrateAssistant(args, client, keyPrefix);
  }

  if (client) {
    console.log("\nFlushing impressions + events to FME (destroy)…");
    await client.destroy();
    console.log("Done. Allow a few minutes, then create/refresh metrics in the");
    console.log("FME console. See docs/EXPERIMENT_HYDRATOR.md for the metric spec.");
  } else {
    console.log("\nDry run complete — re-run without --dry-run (with an SDK key) to send.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
