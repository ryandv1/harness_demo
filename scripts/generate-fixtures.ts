// Regenerates the pre-baked experiment fixtures (D-008, Path A).
//
//   npm run gen:fixtures
//
// Runs the seeded simulator once and writes lib/sim/fixtures.json. The fixture
// is committed so the in-app dashboard renders instantly with no FME/network —
// the reliable "audible-ready" path. Cloners never need to run this; it's a
// maintainer tool (hence tsx is a devDependency only).

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { AI_MODEL_EXPERIMENT } from "@/lib/experiment/config";
import { simulateExperiment } from "@/lib/sim/simulate";

const SEED = 42;
const USERS = 6000;

const result = simulateExperiment(AI_MODEL_EXPERIMENT, { seed: SEED, users: USERS });

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, "..", "lib", "sim", "fixtures.json");
writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n");

const { comparison: c } = result;
console.log(`Wrote ${outPath}`);
console.log(
  `  ${result.totalExposures} exposures · required/arm ≈ ${result.requiredSamplePerArm}`
);
for (const t of result.treatments) {
  console.log(
    `  ${t.treatment.padEnd(7)} rate ${(t.conversionRate * 100).toFixed(1)}%  ` +
      `lat ${t.avgLatencyMs}ms  cost ${t.avgCostCents}¢  (n=${t.exposures})`
  );
}
console.log(
  `  lift +${(c.absoluteLift * 100).toFixed(1)}pt (rel +${(c.relativeLift * 100).toFixed(
    1
  )}%)  p=${c.pValue.toExponential(2)}  ${c.significant ? "SIGNIFICANT" : "n.s."}`
);
