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
];

// Maps the exp_assistant_modelChoice_web treatment to a concrete Anthropic model id.
export const MODEL_BY_TREATMENT: Record<string, string> = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6",
};
