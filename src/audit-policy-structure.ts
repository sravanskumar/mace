/**
 * One-off audit: fetch WKND teaser policy raw JSON and write to docs.
 * Run with: npx ts-node src/audit-policy-structure.ts (or node dist/audit-policy-structure.js after build)
 * Requires AEM_BASE_URL, AEM_USERNAME, AEM_PASSWORD in .env.
 */

import "dotenv/config";
import { writeFileSync } from "fs";
import { join } from "path";
import { aemGet } from "./aem-client.js";

const POLICY_PATH =
  "/conf/wknd/settings/wcm/policies/wknd/components/teaser/policy_1555539430196";
const OUT_FILE = join(
  process.cwd(),
  "docs",
  "policy-audit-teaser-raw.json"
);

async function main() {
  const data = await aemGet<Record<string, unknown>>(
    `${POLICY_PATH}.infinity.json`
  );
  writeFileSync(OUT_FILE, JSON.stringify(data, null, 2), "utf-8");
  const groups = data["cq:styleGroups"] as Record<string, unknown> | undefined;
  const groupKeys = groups ? Object.keys(groups) : [];
  console.log(
    `Wrote raw policy JSON to ${OUT_FILE}. cq:styleGroups keys: ${groupKeys.join(", ") || "(none)"}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
