import type { FlagClient, FlagEvaluation, FlagMode } from "./types";
import { MockFlagClient } from "./mockClient";

// Single cached client per process. FME init is async (await ready); mock is instant.
let clientPromise: Promise<FlagClient> | null = null;

export function getFlagMode(): FlagMode {
  return process.env.FME_SDK_KEY ? "fme" : "mock";
}

export function getFlagClient(): Promise<FlagClient> {
  if (clientPromise) return clientPromise;
  const key = process.env.FME_SDK_KEY;

  clientPromise = (async () => {
    if (key) {
      try {
        // Lazy import so the splitio SDK only loads when actually going live.
        const { FmeFlagClient } = await import("./fmeClient");
        return await FmeFlagClient.create(key);
      } catch (err) {
        console.error("[flags] FME init failed; falling back to mock:", err);
        return new MockFlagClient();
      }
    }
    return new MockFlagClient();
  })();

  return clientPromise;
}

/** Evaluate a flag and capture local-evaluation latency (the FME architecture story). */
export function evaluateFlag(
  client: FlagClient,
  userKey: string,
  flag: string,
  attributes?: Record<string, unknown>
): FlagEvaluation {
  const start = performance.now();
  const treatment = client.getTreatment(userKey, flag, attributes);
  const latencyMicros = Math.max(0, Math.round((performance.now() - start) * 1000));
  return { flag, treatment, source: client.mode, latencyMicros };
}
