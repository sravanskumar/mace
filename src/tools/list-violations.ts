import "dotenv/config";
import { z } from "zod";
import { aemGet } from "../aem-client.js";
import {
  loadConfig,
  getRuleForRegion,
  getRuleForRegionPath,
  getAllowedStyleNamesNormalized,
  type GovernanceRule,
} from "../governance-config.js";
import { getPolicyStyles } from "../policy-styles.js";
import { getPolicyPathForPageComponent } from "../template-policy-resolver.js";
import { handleListPages } from "./list-pages.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const TRAVERSAL_DEPTH = parseInt(process.env.TRAVERSAL_DEPTH ?? "10", 10);

const inputSchema = z
  .object({
    pagePath: z.string().optional(),
    regionPath: z.string().optional(),
    /** If omitted, scan all component types in the rule for the path. */
    componentType: z.string().optional(),
  })
  .refine(
    (data) => {
      const hasPage = Boolean(data.pagePath?.trim());
      const hasRegion = Boolean(data.regionPath?.trim());
      return (hasPage && !hasRegion) || (!hasPage && hasRegion);
    },
    { message: "Provide exactly one of pagePath (single page) or regionPath (path and descendants)." }
  );

interface ComponentInstance {
  path: string;
  appliedStyles: string[];
}

function findComponentsByType(
  node: unknown,
  nodePath: string,
  depth: number,
  resourceType: string
): ComponentInstance[] {
  if (depth < 0 || node === null || typeof node !== "object" || Array.isArray(node)) {
    return [];
  }
  const obj = node as Record<string, unknown>;
  const collected: ComponentInstance[] = [];

  const rt = obj["sling:resourceType"];
  if (typeof rt === "string" && rt === resourceType) {
    const raw = obj["cq:styleIds"];
    const appliedStyles = Array.isArray(raw)
      ? (raw as string[])
      : typeof raw === "string"
        ? [raw]
        : [];
    collected.push({ path: nodePath, appliedStyles });
  }

  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith("jcr:") || key.startsWith("cq:")) continue;
    if (Array.isArray(val) || val === null || typeof val !== "object") continue;
    collected.push(...findComponentsByType(val, `${nodePath}/${key}`, depth - 1, resourceType));
  }

  return collected;
}

type ViolationType = "NO_STYLE" | "REGION_VIOLATION" | "POLICY_MISCONFIGURATION";

interface Violation {
  page: string;
  componentPath: string;
  /** Governed component resource type (e.g. wknd/components/teaser). */
  componentType: string;
  violationType: ViolationType;
  /** Style IDs currently applied on the component. */
  appliedStyles: string[];
  /** Current style names on the component (labels for appliedStyles). Compare with allowedStyleNames to see what is not allowed. */
  appliedStyleLabels?: string[];
  policyPath: string;
  /** Style names allowed by governance rules for this region/component. */
  allowedStyleNames?: string[];
  /** Resolved cq:styleIds allowed by governance rules. */
  allowedStyleIds?: string[];
  styleNamesNotFoundInPolicy?: string[];
}

export const listViolationsTool: Tool = {
  name: "list_style_violations",
  description:
    "Scan governed components for style violations. Violations are styles applied on the component that are not allowed by governance rules for that region (the template policy may allow them). Each violation includes appliedStyleLabels (current styles) and allowedStyleNames (allowed by governance); clients can show a table with columns e.g. Component path, Applied styles (violation), Allowed style names. Use pagePath for a single page; use regionPath for that path and all descendant pages. When specifying a component, use the fully qualified resource type (e.g. wknd/components/teaser). Omit componentType to scan all component types in the rule.",
  inputSchema: {
    type: "object" as const,
    properties: {
      pagePath: {
        type: "string" as const,
        description:
          "Scan only this page (no children). Use when the user asks for a specific page (e.g. 'on page X').",
      },
      regionPath: {
        type: "string" as const,
        description:
          "Scan the region page itself and all descendant pages. Use when the user asks for a region (e.g. 'under region X', 'list all violations under X'). The page count and violations include the region path as well as its children.",
      },
      componentType: {
        type: "string" as const,
        description:
          "Optional. Fully qualified component resource type only (e.g. wknd/components/teaser). Use this format to avoid ambiguity when multiple components could match. If omitted, scan all component types in the rule for the path.",
      },
    },
    required: [],
  },
};

export async function handleListViolations(
  args: Record<string, unknown>
): Promise<CallToolResult> {
  const parsed = inputSchema.parse(args);
  const pagePathArg = parsed.pagePath?.trim();
  const regionPathArg = parsed.regionPath?.trim();
  const componentTypeArg = parsed.componentType?.trim();
  const scopePath = pagePathArg ?? regionPathArg!;

  const config = await loadConfig();

  const rulesToScan: GovernanceRule[] = [];
  if (componentTypeArg) {
    const rule = getRuleForRegion(scopePath, componentTypeArg, config);
    if (rule) rulesToScan.push(rule);
  } else {
    const fullRule = getRuleForRegionPath(scopePath, config);
    if (!fullRule) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: "No governance rule found for path.",
                ...(pagePathArg ? { pagePath: pagePathArg } : { regionPath: regionPathArg }),
              },
              null,
              2
            ),
          },
        ],
      };
    }
    for (const c of fullRule.components) {
      const rule = getRuleForRegion(scopePath, c.type, config);
      if (rule) rulesToScan.push(rule);
    }
  }

  if (rulesToScan.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              error: componentTypeArg
                ? "No governance rule found for path and component type " + componentTypeArg
                : "No governance rule found for path.",
              ...(pagePathArg ? { pagePath: pagePathArg } : { regionPath: regionPathArg }),
              ...(componentTypeArg ? { componentType: componentTypeArg } : {}),
            },
            null,
            2
          ),
        },
      ],
    };
  }

  let pages: string[];
  if (pagePathArg) {
    pages = [pagePathArg];
  } else {
    const listResult = await handleListPages({ regionPath: regionPathArg! });
    const textContent = listResult.content?.[0];
    if (!textContent || textContent.type !== "text") {
      return {
        content: [{ type: "text" as const, text: "Failed to list pages" }],
      };
    }
    const listData = JSON.parse(textContent.text) as { pages?: string[] };
    const descendantPages = listData.pages ?? [];
    // Include the region page itself: QueryBuilder typically returns only descendants.
    pages = descendantPages.includes(regionPathArg!)
      ? descendantPages
      : [regionPathArg!, ...descendantPages];
  }

  const violations: Violation[] = [];
  const resolutionFailedPages: string[] = [];

  for (const pagePath of pages) {
    let pageTree: Record<string, unknown>;
    try {
      pageTree = await aemGet<Record<string, unknown>>(
        `${pagePath}/jcr:content.infinity.json`
      );
    } catch {
      continue;
    }

    for (const rule of rulesToScan) {
      const componentResourceType = rule.componentType;
      let policyPathForPage: string | null;
      if (rule.policyPath?.trim()) {
        policyPathForPage = rule.policyPath;
      } else {
        policyPathForPage = await getPolicyPathForPageComponent(
          pagePath,
          componentResourceType,
          aemGet,
          { regionPath: scopePath }
        );
        if (!policyPathForPage) {
          resolutionFailedPages.push(pagePath);
          continue;
        }
      }

      let policyResult: { labelToId: Record<string, string>; styles: { styleId: string; styleLabel: string }[] };
      try {
        policyResult = await getPolicyStyles(policyPathForPage, aemGet);
      } catch {
        resolutionFailedPages.push(pagePath);
        continue;
      }

      const labelToId = policyResult.labelToId;
      const idToLabel: Record<string, string> = Object.fromEntries(
        policyResult.styles.map((s) => [s.styleId, s.styleLabel || s.styleId])
      );

      const allowedNamesNormalized = getAllowedStyleNamesNormalized(rule);
      const allowedStyleNamesFromRule = rule.allowedStyleNames ?? [];
      const styleNamesNotFoundInPolicy = allowedStyleNamesFromRule.filter(
        (name) => !labelToId[name.toLowerCase()]
      );
      const allowedIds = allowedNamesNormalized
        .map((name) => labelToId[name])
        .filter(Boolean);
      const allowedIdSet = new Set<string>(allowedIds);

      const ruleHasInvalidStyleNames = styleNamesNotFoundInPolicy.length > 0;
      const violationContext = {
        componentType: componentResourceType,
        policyPath: policyPathForPage,
        allowedStyleNames: allowedStyleNamesFromRule,
        allowedStyleIds: allowedIds,
      };

      if (ruleHasInvalidStyleNames) {
        violations.push({
          page: pagePath,
          componentPath: pagePath,
          violationType: "POLICY_MISCONFIGURATION",
          appliedStyles: [],
          appliedStyleLabels: [],
          styleNamesNotFoundInPolicy,
          ...violationContext,
        });
      }

      const instances = findComponentsByType(
        pageTree,
        `${pagePath}/jcr:content`,
        TRAVERSAL_DEPTH,
        componentResourceType
      );

      for (const t of instances) {
        const { path: componentPath, appliedStyles } = t;
        const appliedStyleLabels = appliedStyles.map((id) => idToLabel[id] ?? id);
        if (appliedStyles.length === 0) {
          violations.push({
            page: pagePath,
            componentPath,
            violationType: "NO_STYLE",
            appliedStyles: [],
            appliedStyleLabels: [],
            ...violationContext,
          });
          continue;
        }
        if (ruleHasInvalidStyleNames) continue;
        const hasNotAllowed = appliedStyles.some((s) => !allowedIdSet.has(s));
        if (hasNotAllowed) {
          violations.push({
            page: pagePath,
            componentPath,
            violationType: "REGION_VIOLATION",
            appliedStyles,
            appliedStyleLabels,
            ...violationContext,
          });
        }
      }
    }
  }

  if (resolutionFailedPages.length > 0) {
    console.warn(
      "[MACE] Template→policy resolution failed for pages (skipped):",
      resolutionFailedPages
    );
  }

  const componentTypesScanned = [...new Set(rulesToScan.map((r) => r.componentType))];
  const singleRule = rulesToScan.length === 1 ? rulesToScan[0] : null;

  const payload = {
    ...(pagePathArg ? { pagePath: pagePathArg, scope: "page" } : { regionPath: regionPathArg, scope: "region" }),
    ...(componentTypesScanned.length > 0 && { componentTypesScanned }),
    ...(singleRule && { allowedStyleNames: singleRule.allowedStyleNames ?? [] }),
    totalPages: pages.length,
    pagesSkippedResolution: resolutionFailedPages.length,
    ...(resolutionFailedPages.length > 0 && { resolutionFailedPages }),
    totalViolations: violations.length,
    violations,
  };

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}
