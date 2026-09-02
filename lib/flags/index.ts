import type {
  FlagClient,
  FlagEnvironmentInfo,
  FlagEvaluation,
  FlagMode,
} from "./types";
import { MockFlagClient } from "./mockClient";
import { FLAG_DEFS } from "./flags";

// Single cached client per process. FME init is async (await ready); mock is instant.
let clientPromise: Promise<FlagClient> | null = null;

export function getFlagMode(): FlagMode {
  return process.env.FME_SDK_KEY ? "fme" : "mock";
}

/**
 * Which FME environment's flag definitions the page is reading. In FME the SDK key
 * is per-environment, so the env can't be auto-detected from the key — set
 * FME_ENVIRONMENT (staging | production) to label it. Falls back to "Mock" when no
 * live key is configured, or "FME (env unset)" when live but unlabeled. An
 * unexpanded "${...}" value is ignored (treated as unset).
 */
export function getFlagEnvironment(): FlagEnvironmentInfo {
  const raw = process.env.FME_ENVIRONMENT?.trim();
  if (raw && !raw.startsWith("${")) {
    const lower = raw.toLowerCase();
    if (lower === "production" || lower === "prod") {
      return { label: "Production", kind: "production" };
    }
    if (lower === "staging" || lower === "stg") {
      return { label: "Staging", kind: "staging" };
    }
    return { label: raw, kind: "other" };
  }
  return getFlagMode() === "fme"
    ? { label: "FME (env unset)", kind: "other" }
    : { label: "Mock", kind: "mock" };
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
  const { treatment, config } = client.getTreatmentWithConfig(userKey, flag, attributes);
  const latencyMicros = Math.max(0, Math.round((performance.now() - start) * 1000));
  return { flag, treatment, source: client.mode, latencyMicros, config };
}

/** Evaluate every known flag for a user — shared by the /api/flags GET route and the SSE stream. */
export async function evaluateAllFlags(
  userId: string,
  attributes?: Record<string, unknown>
): Promise<FlagEvaluation[]> {
  const client = await getFlagClient();
  return FLAG_DEFS.map((def) => evaluateFlag(client, userId, def.key, attributes));
}
