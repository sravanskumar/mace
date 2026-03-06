import "dotenv/config";
import { z } from "zod";
import { aemGet } from "../aem-client.js";
import { loadConfig, getRuleForRegion } from "../governance-config.js";
import { handleListPages } from "./list-pages.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const TRAVERSAL_DEPTH = parseInt(process.env.TRAVERSAL_DEPTH ?? "10", 10);

const inputSchema = z.object({
  regionPath: z.string(),
});

interface TeaserInfo {
  path: string;
  appliedStyles: string[];
}

function findTeasers(
  node: unknown,
  nodePath: string,
  depth: number
): TeaserInfo[] {
  if (depth < 0 || node === null || typeof node !== "object" || Array.isArray(node)) {
    return [];
  }
  const obj = node as Record<string, unknown>;
  const collected: TeaserInfo[] = [];

  const resourceType = obj["sling:resourceType"];
  const rt = typeof resourceType === "string" ? resourceType : "";
  if (rt.endsWith("/teaser") || rt === "teaser") {
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
    collected.push(...findTeasers(val, `${nodePath}/${key}`, depth - 1));
  }

  return collected;
}

type ViolationType = "NO_STYLE" | "REGION_VIOLATION";

interface Violation {
  page: string;
  componentPath: string;
  violationType: ViolationType;
  appliedStyles: string[];
  invalidStyles?: string[];
  policyPath: string;
}

export const listViolationsTool: Tool = {
  name: "list_teaser_style_violations",
  description: "Scan all Teaser components under a region and return violations.",
  inputSchema: {
    type: "object" as const,
    properties: {
      regionPath: { type: "string" as const, description: "AEM content path (region) to scan" },
    },
    required: ["regionPath"],
  },
};

export async function handleListViolations(
  args: Record<string, unknown>
): Promise<CallToolResult> {
  const { regionPath } = inputSchema.parse(args);

  const config = await loadConfig();
  const rule = getRuleForRegion(regionPath, "teaser", config);
  if (!rule) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { error: "No governance rule found for region and component type teaser", regionPath },
            null,
            2
          ),
        },
      ],
    };
  }

  const listResult = await handleListPages({ regionPath });
  const textContent = listResult.content?.[0];
  if (!textContent || textContent.type !== "text") {
    return {
      content: [{ type: "text" as const, text: "Failed to list pages" }],
    };
  }
  const listData = JSON.parse(textContent.text) as { pages?: string[] };
  const pages: string[] = listData.pages ?? [];

  const violations: Violation[] = [];

  for (const pagePath of pages) {
    let pageTree: Record<string, unknown>;
    try {
      pageTree = await aemGet<Record<string, unknown>>(
        `${pagePath}/jcr:content.infinity.json`
      );
    } catch {
      continue;
    }

    const teasers = findTeasers(pageTree, `${pagePath}/jcr:content`, TRAVERSAL_DEPTH);
    const allowedSet = new Set(rule.allowedStyleIds);

    for (const t of teasers) {
      const { path: componentPath, appliedStyles } = t;
      if (appliedStyles.length === 0) {
        violations.push({
          page: pagePath,
          componentPath,
          violationType: "NO_STYLE",
          appliedStyles: [],
          policyPath: rule.policyPath,
        });
        continue;
      }
      const invalidStyles = appliedStyles.filter((s) => !allowedSet.has(s));
      if (invalidStyles.length > 0) {
        violations.push({
          page: pagePath,
          componentPath,
          violationType: "REGION_VIOLATION",
          appliedStyles,
          invalidStyles,
          policyPath: rule.policyPath,
        });
      }
    }
  }

  const payload = {
    regionPath,
    allowedStyleIds: rule.allowedStyleIds,
    totalPages: pages.length,
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
