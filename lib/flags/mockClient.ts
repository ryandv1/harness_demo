import type { FlagClient, FlagMode } from "./types";
import { FLAGS, CONTROL } from "./flags";

// Runtime overrides let us flip flags live during a demo WITHOUT an FME account
// (this simulates changing a Split in the Harness FME UI). Cached on globalThis
// so toggles survive dev hot-reloads.
type OverrideStore = Map<string, string>;

declare global {
  // eslint-disable-next-line no-var
  var __flagOverrides: OverrideStore | undefined;
}

const overrides: OverrideStore = globalThis.__flagOverrides ?? new Map();
globalThis.__flagOverrides = overrides;

export function setOverride(flag: string, treatment: string | null): void {
  if (treatment === null) overrides.delete(flag);
  else overrides.set(flag, treatment);
}

export function getOverrides(): Record<string, string> {
  return Object.fromEntries(overrides);
}

export class MockFlagClient implements FlagClient {
  readonly mode: FlagMode = "mock";

  getTreatment(
    _userKey: string,
    flag: string,
    attributes?: Record<string, unknown>
  ): string {
    // 1) An explicit runtime override always wins (simulates flipping in FME).
    const overridden = overrides.get(flag);
    if (overridden) return overridden;

    // 2) Otherwise apply the default targeting rules (what you'd set up in FME).
    const tier = (attributes?.tier as string) ?? "free";
    switch (flag) {
      case FLAGS.AI_ASSISTANT_ENABLED:
        return "on";
      case FLAGS.AI_MODEL:
        return tier === "premium" ? "sonnet" : "haiku";
      default:
        return CONTROL;
    }
  }
}
