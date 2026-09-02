import type { FlagClient, FlagMode, TreatmentWithConfig } from "./types";
import { FLAGS, CONTROL, MODEL_CONFIG_BY_TREATMENT, MORTGAGE_BANNER_CONFIG_BY_TREATMENT } from "./flags";

// Runtime overrides let us flip flags live during a demo WITHOUT an FME account
// (this simulates changing a Split in the Harness FME UI). Cached on globalThis
// so toggles survive dev hot-reloads.
type OverrideStore = Map<string, string>;

type Listener = () => void;

declare global {
  // eslint-disable-next-line no-var
  var __flagOverrides: OverrideStore | undefined;
  // eslint-disable-next-line no-var
  var __flagOverrideListeners: Set<Listener> | undefined;
}

const overrides: OverrideStore = globalThis.__flagOverrides ?? new Map();
globalThis.__flagOverrides = overrides;

// Mock stand-in for FME's SDK_UPDATE stream: there's no real backend pushing
// changes here, so we notify subscribers ourselves whenever a demo toggle
// flips an override. Cached on globalThis for the same reason as `overrides`.
const listeners: Set<Listener> = globalThis.__flagOverrideListeners ?? new Set();
globalThis.__flagOverrideListeners = listeners;

export function setOverride(flag: string, treatment: string | null): void {
  if (treatment === null) overrides.delete(flag);
  else overrides.set(flag, treatment);
  listeners.forEach((listener) => listener());
}

export function getOverrides(): Record<string, string> {
  return Object.fromEntries(overrides);
}

export class MockFlagClient implements FlagClient {
  readonly mode: FlagMode = "mock";

  getTreatment(
    userKey: string,
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
      case FLAGS.MORTGAGE_REFI_BANNER:
        return "on";
      case FLAGS.MORTGAGE_APPLICATION_FLOW:
        // Deterministic per-user targeting (individual-key rules), not random
        // bucketing — mirrors the individual targets set up live in FME so
        // switching users always demos both flow variants reliably.
        if (userKey === "riley") return "singleScreen";
        if (userKey === "jordan") return "twoPage";
        return "singleScreen";
      default:
        return CONTROL;
    }
  }

  getTreatmentWithConfig(
    userKey: string,
    flag: string,
    attributes?: Record<string, unknown>
  ): TreatmentWithConfig {
    const treatment = this.getTreatment(userKey, flag, attributes);
    // Reproduce FME Dynamic Configuration so mock mode matches live behavior;
    // flags without a config map carry no payload.
    let config: string | null = null;
    if (flag === FLAGS.AI_MODEL) {
      const c = MODEL_CONFIG_BY_TREATMENT[treatment];
      config = c ? JSON.stringify(c) : null;
    } else if (flag === FLAGS.MORTGAGE_REFI_BANNER) {
      const c = MORTGAGE_BANNER_CONFIG_BY_TREATMENT[treatment];
      config = c ? JSON.stringify(c) : null;
    }
    return { treatment, config };
  }

  onUpdate(callback: () => void): () => void {
    listeners.add(callback);
    return () => listeners.delete(callback);
  }

  track(userKey: string, eventType: string, value?: number): boolean {
    // No real backend in mock mode — log so the demo can still show that a
    // metric event fired. Live mode sends this to FME's Events API instead.
    console.log(`[flags:mock] track ${eventType} key=${userKey} value=${value ?? 1}`);
    return true;
  }
}
