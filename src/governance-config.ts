import "dotenv/config";
import { readFile } from "fs/promises";
import path from "path";
import { z } from "zod";

const ruleSchema = z.object({
  region: z.string(),
  componentType: z.string(),
  allowedStyleIds: z.array(z.string()),
  policyPath: z.string(),
  notes: z.string().optional(),
});

const configSchema = z.object({
  version: z.string(),
  description: z.string().optional(),
  rules: z.array(ruleSchema),
});

export type GovernanceRule = z.infer<typeof ruleSchema>;

type GovernanceConfig = z.infer<typeof configSchema>;

let cachedConfig: GovernanceConfig | null = null;

/**
 * Load governance config from GOVERNANCE_RULES_PATH or ./governance-rules.json.
 * Parses and validates with Zod; result is cached.
 */
export async function loadConfig(): Promise<GovernanceConfig> {
  if (cachedConfig) return cachedConfig;
  const configPath =
    process.env.GOVERNANCE_RULES_PATH ?? "./governance-rules.json";
  const resolved = path.resolve(process.cwd(), configPath);
  const raw = await readFile(resolved, "utf-8");
  const parsed = JSON.parse(raw) as unknown;
  cachedConfig = configSchema.parse(parsed);
  return cachedConfig;
}

/**
 * Return the first rule whose region is a prefix of regionPath and whose
 * componentType matches, or undefined.
 */
export function getRuleForRegion(
  regionPath: string,
  componentType: string,
  config: GovernanceConfig
): GovernanceRule | undefined {
  return config.rules.find(
    (rule) =>
      regionPath.startsWith(rule.region) && rule.componentType === componentType
  );
}
