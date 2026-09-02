// Flag definitions. These mirror the Splits you would configure in the Harness
// FME UI; the mock client reproduces their default targeting so the demo runs
// identically with or without a real FME account.
//
// Safe to import from client components: this file has no server-only imports.

// Flag keys follow the project naming convention: <prefix>_<area>_<descriptor>_<platform>
// where prefix encodes the FME category (rel_ / exp_ / ops_). See docs/DEMO_GOVERNANCE.md.
// In the FME console each flag also carries a `category-*` and `squad-*` tag.
export const FLAGS = {
  // Operational kill switch (default ON). Tag: category-operational, squad-ai.
  AI_ASSISTANT_ENABLED: "ops_assistant_killSwitch_web",
  // Experimental model choice — Haiku vs Sonnet A/B. Tag: category-experimental, squad-ai.
  AI_MODEL: "exp_assistant_modelChoice_web",
  // Mortgage refinance announcement banner + its copy/rate/fee-formula Dynamic
  // Config. Tag: category-release, squad-payments. Owner: team_pm_ai.
  MORTGAGE_REFI_BANNER: "rel_mortgage_refinanceBanner_web",
  // A/B: single-screen vs. 2-page refinance application flow. Riley/Jordan are
  // pinned to specific variants via deterministic per-user targeting (not
  // random bucketing) so switching users reliably demos both flows. Pre-
  // populated via the experiment hydrator (D-016 Path B) — no live results UI
  // in-app; refer to the FME console. Tag: category-experimental, squad-payments.
  MORTGAGE_APPLICATION_FLOW: "exp_mortgage_applicationFlow_web",
} as const;

// FME returns this control treatment when a flag is unknown or the SDK isn't ready.
export const CONTROL = "control";

export interface FlagDef {
  key: string;
  label: string;
  treatments: string[];
  default: string;
  describe: (treatment: string) => string;
}

export const FLAG_DEFS: FlagDef[] = [
  {
    key: FLAGS.AI_ASSISTANT_ENABLED,
    label: "AI Assistant",
    treatments: ["on", "off"],
    default: "on",
    describe: (t) =>
      t === "on" ? "Assistant is live" : "Kill switch engaged — assistant disabled",
  },
  {
    key: FLAGS.AI_MODEL,
    label: "AI Model",
    treatments: ["haiku", "sonnet"],
    default: "haiku",
    describe: (t) =>
      t === "sonnet"
        ? "Claude Sonnet — higher quality (premium tier)"
        : "Claude Haiku — fast & low cost (standard tier)",
  },
  {
    key: FLAGS.MORTGAGE_REFI_BANNER,
    label: "Refi Banner",
    treatments: ["on", "off"],
    default: "on",
    describe: (t) =>
      t === "on" ? "Refinance banner is live" : "Banner hidden",
  },
  {
    key: FLAGS.MORTGAGE_APPLICATION_FLOW,
    label: "Application Flow",
    treatments: ["singleScreen", "twoPage"],
    default: "singleScreen",
    describe: (t) =>
      t === "singleScreen"
        ? "Single-screen application (all inputs at once)"
        : "2-page guided application flow",
  },
];

// --- Dynamic Configuration (FME treatment configs) ---
// Each treatment of exp_assistant_modelChoice_web carries a JSON payload of model
// parameters. In live FME this is the treatment's "configurations" field, read via
// getTreatmentWithConfig; in mock mode we reproduce it from the map below so the demo
// behaves identically with no key. Editing these values in the FME UI changes the
// assistant's behavior with NO redeploy — the experimentation-beyond-models story.
export interface ModelConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  systemVariant: "concise" | "detailed";
  contextTransactions: number;
}

export const MODEL_CONFIG_BY_TREATMENT: Record<string, ModelConfig> = {
  haiku: {
    model: "claude-haiku-4-5-20251001",
    temperature: 0.7,
    maxTokens: 400,
    systemVariant: "concise",
    contextTransactions: 10,
  },
  sonnet: {
    model: "claude-sonnet-4-6",
    temperature: 0.2,
    maxTokens: 600,
    systemVariant: "detailed",
    contextTransactions: 20,
  },
};

// Back-compat: treatment -> model id, derived from the config map (single source of truth).
export const MODEL_BY_TREATMENT: Record<string, string> = Object.fromEntries(
  Object.entries(MODEL_CONFIG_BY_TREATMENT).map(([t, c]) => [t, c.model])
);

// Resolve the effective ModelConfig: prefer the live FME config JSON (merged over the
// local defaults so partial payloads are safe), else fall back to the parity map.
export function resolveModelConfig(
  treatment: string,
  configJson?: string | null
): ModelConfig {
  const fallback =
    MODEL_CONFIG_BY_TREATMENT[treatment] ?? MODEL_CONFIG_BY_TREATMENT.haiku;
  if (!configJson) return fallback;
  try {
    const parsed = JSON.parse(configJson) as Partial<ModelConfig>;
    return { ...fallback, ...parsed, model: parsed.model ?? fallback.model };
  } catch {
    return fallback;
  }
}

// --- Mortgage refinance banner: Dynamic Configuration ---
// rel_mortgage_refinanceBanner_web's "on" treatment carries a JSON payload with
// both the banner's copy (headline/rate/CTA) AND the refinance fee-formula
// parameters. Bundling them means a seller can change the promoted rate *and*
// the fee math live in the FME console with no redeploy — the same "watch it
// change" mechanic as the AI model's Dynamic Config above.
export interface MortgageBannerConfig {
  headline: string;
  promotedRateLabel: string;
  detailsBlurb: string;
  ctaLabel: string;
  // Fee-formula params (see lib/mortgage/fees.ts):
  lowRatePointsPct: number; // points (% of refinance amount) charged upfront for the low-rate option
  zeroUpfrontRateDeltaBps: number; // rate premium (bps) for the zero-upfront option, shown for context
  baseFeeCents: number; // flat processing fee charged under either pricing option
}

export const MORTGAGE_BANNER_CONFIG_BY_TREATMENT: Record<string, MortgageBannerConfig> = {
  on: {
    headline: "Rates just dropped — refinance and save",
    promotedRateLabel: "5.99% APR",
    detailsBlurb:
      "Lock in a lower rate on your mortgage. See your personalized options in under 2 minutes.",
    ctaLabel: "Check my rate",
    lowRatePointsPct: 1.5,
    zeroUpfrontRateDeltaBps: 50,
    baseFeeCents: 45000,
  },
  off: {
    headline: "",
    promotedRateLabel: "",
    detailsBlurb: "",
    ctaLabel: "",
    lowRatePointsPct: 1.5,
    zeroUpfrontRateDeltaBps: 50,
    baseFeeCents: 45000,
  },
};

export function resolveMortgageBannerConfig(
  treatment: string,
  configJson?: string | null
): MortgageBannerConfig {
  const fallback =
    MORTGAGE_BANNER_CONFIG_BY_TREATMENT[treatment] ?? MORTGAGE_BANNER_CONFIG_BY_TREATMENT.on;
  if (!configJson) return fallback;
  try {
    const parsed = JSON.parse(configJson) as Partial<MortgageBannerConfig>;
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}
