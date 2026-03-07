import "dotenv/config";
import { access } from "fs/promises";
import { readFile } from "fs/promises";
import path from "path";
import { z } from "zod";

/** Error thrown when the governance rules file is missing; includes setup instructions. */
export const GOVERNANCE_RULES_NOT_FOUND =
  "Governance rules file not found. Copy governance-rules.example.json to governance-rules.json in the project root (same folder as .env), then edit. Alternatively, set GOVERNANCE_RULES_PATH in your environment (or .env) to point to your governance rules JSON file.";

const componentEntrySchema = z
  .object({
    /** Fully qualified component resource type (e.g. wknd/components/teaser). */
    type: z.string(),
    /** Style labels (cq:styleLabel) allowed in this region for this component. Preferred. */
    allowedStyleNames: z.array(z.string()).optional(),
    /** @deprecated Use allowedStyleNames. Log warning and ignore. */
    allowedStyleIds: z.array(z.string()).optional(),
    /** Optional override: policy path for this component. If absent, resolved per page from template. */
    policyPath: z.string().optional(),
  })
  .refine(
    (c) => (c.allowedStyleNames?.length ?? 0) > 0 || (c.allowedStyleIds?.length ?? 0) > 0,
    { message: "Each component entry must have at least one of allowedStyleNames or allowedStyleIds" }
  );

const ruleSchema = z.object({
  region: z.string(),
  components: z.array(componentEntrySchema),
  /** Optional region-level policy path fallback when component has no policyPath. */
  policyPath: z.string().optional(),
});

const configSchema = z.object({
  version: z.string(),
  description: z.string().optional(),
  rules: z.array(ruleSchema),
});

export type ComponentEntry = z.infer<typeof componentEntrySchema>;
export type GovernanceRuleConfig = z.infer<typeof ruleSchema>;
type GovernanceConfig = z.infer<typeof configSchema>;

/**
 * Flattened view of a matched rule + component entry, used by violation scanning and fix tools.
 * Same shape as the previous single-component-per-rule schema so downstream logic is unchanged.
 */
export interface GovernanceRule {
  region: string;
  componentType: string;
  allowedStyleNames?: string[];
  policyPath?: string;
}

/**
 * Return allowed style names for lookup. Prefers allowedStyleNames; if only
 * deprecated allowedStyleIds is present, logs a warning and returns [].
 * Values are normalized for case-insensitive comparison (lowercase).
 */
export function getAllowedStyleNamesNormalized(rule: GovernanceRule): string[] {
  if (rule.allowedStyleNames && rule.allowedStyleNames.length > 0) {
    return rule.allowedStyleNames.map((s) => s.toLowerCase());
  }
  if ("allowedStyleIds" in rule && Array.isArray((rule as { allowedStyleIds?: string[] }).allowedStyleIds)) {
    const ids = (rule as { allowedStyleIds: string[] }).allowedStyleIds;
    if (ids.length > 0) {
      console.warn(
        "[MACE] Governance rule uses deprecated allowedStyleIds; use allowedStyleNames (style labels) instead. Rule region:",
        rule.region
      );
    }
    return [];
  }
  return [];
}

/**
 * Load governance config from GOVERNANCE_RULES_PATH or governance-rules.json in the project root (same folder as .env).
 * If GOVERNANCE_RULES_PATH is set: absolute paths are used as-is; relative paths are resolved from the project root.
 * Parses and validates with Zod. Reads from disk on every call so rule changes take effect without restarting the server.
 */
export async function loadConfig(): Promise<GovernanceConfig> {
  const baseDir = process.env.MACE_PROJECT_ROOT || process.cwd();
  const envPath = process.env.GOVERNANCE_RULES_PATH;
  const resolved = envPath
    ? path.isAbsolute(envPath)
      ? envPath
      : path.resolve(baseDir, envPath)
    : path.join(baseDir, "governance-rules.json");

  try {
    await access(resolved);
  } catch (err: unknown) {
    const code = err && typeof err === "object" && "code" in err ? (err as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT") {
      throw new Error(`${GOVERNANCE_RULES_NOT_FOUND} (Looked at: ${resolved})`);
    }
    throw err;
  }

  const raw = await readFile(resolved, "utf-8");
  const parsed = JSON.parse(raw) as unknown;
  return configSchema.parse(parsed);
}

/**
 * Find the rule whose region is a path prefix of regionPath. Returns the full rule
 * (region + components) so callers can scan all governed component types when
 * componentType is not specified.
 */
export function getRuleForRegionPath(
  regionPath: string,
  config: GovernanceConfig
): GovernanceConfig["rules"][0] | undefined {
  return config.rules.find((r) => regionPath.startsWith(r.region));
}

/**
 * Find the rule whose region is a path prefix of regionPath, then find the component
 * entry whose type exactly matches componentType. Returns a flattened GovernanceRule
 * (region, componentType, allowedStyleNames, policyPath) or undefined.
 */
export function getRuleForRegion(
  regionPath: string,
  componentType: string,
  config: GovernanceConfig
): GovernanceRule | undefined {
  const rule = getRuleForRegionPath(regionPath, config);
  if (!rule) return undefined;

  const component = rule.components.find((c) => c.type === componentType);
  if (!component) return undefined;

  if (component.allowedStyleIds && component.allowedStyleIds.length > 0 && (!component.allowedStyleNames || component.allowedStyleNames.length === 0)) {
    console.warn(
      "[MACE] Governance component entry uses deprecated allowedStyleIds; use allowedStyleNames (style labels) instead. Region:",
      rule.region,
      "component:",
      component.type
    );
  }

  const policyPath = component.policyPath?.trim() ?? rule.policyPath?.trim();

  return {
    region: rule.region,
    componentType: component.type,
    allowedStyleNames: component.allowedStyleNames,
    ...(policyPath ? { policyPath } : {}),
  };
}
