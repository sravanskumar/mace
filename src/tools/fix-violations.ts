import "dotenv/config";
import { z } from "zod";
import { aemGet } from "../aem-client.js";
import { aemPost } from "../aem-client.js";
import { resolveStyleToId } from "../policy-styles.js";
import { getPolicyPathForPageComponent } from "../template-policy-resolver.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const violationSchema = z.object({
  componentPath: z.string(),
  violationType: z.string(),
  policyPath: z.string().optional(),
});

const inputSchema = z.object({
  violations: z.array(violationSchema),
  styleId: z.string(),
});

type ResultItem =
  | { componentPath: string; violationType: string; status: "fixed" }
  | {
      componentPath: string;
      violationType: string;
      status: "error";
      error: string;
    };

export const fixViolationsTool: Tool = {
  name: "fix_style_violations",
  description:
    "Bulk-fix all violations from list_style_violations. Prefer style by name (e.g. Default, Featured); use cq:styleId only as fallback.",
  inputSchema: {
    type: "object" as const,
    properties: {
      violations: {
        type: "array" as const,
        description:
          "Array of { componentPath, violationType, policyPath? } from list_style_violations (include policyPath when using style by name)",
        items: {
          type: "object" as const,
          properties: {
            componentPath: { type: "string" as const },
            violationType: { type: "string" as const },
            policyPath: { type: "string" as const, description: "Policy path from violation report (needed to resolve style by name)" },
          },
          required: ["componentPath", "violationType"],
        },
      },
      styleId: {
        type: "string" as const,
        description:
          "Style name (preferred) or cq:styleId. Use names like Default, Featured from list_component_styles; IDs are fallback only.",
      },
    },
    required: ["violations", "styleId"],
  },
};

function pagePathFromComponentPath(componentPath: string): string {
  const idx = componentPath.indexOf("/jcr:content");
  return idx > 0 ? componentPath.slice(0, idx) : componentPath;
}

export async function handleFixViolations(
  args: Record<string, unknown>
): Promise<CallToolResult> {
  const { violations, styleId: styleInput } = inputSchema.parse(args);

  if (violations.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            summary: { total: 0, fixed: 0, errors: 0 },
            styleApplied: null,
            results: [],
          }, null, 2),
        },
      ],
    };
  }

  let policyPath: string | null =
    violations.find((v) => v.policyPath?.trim())?.policyPath ?? null;
  if (!policyPath) {
    const firstPagePath = pagePathFromComponentPath(violations[0].componentPath);
    policyPath = await getPolicyPathForPageComponent(
      firstPagePath,
      "wknd/components/teaser",
      aemGet
    );
  }
  if (!policyPath) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error:
              "Could not determine policy path to resolve style. Pass violations that include policyPath from the violation report.",
          }, null, 2),
        },
      ],
    };
  }

  const resolved = await resolveStyleToId(policyPath, styleInput, aemGet);
  if ("error" in resolved) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: resolved.error }, null, 2),
        },
      ],
    };
  }
  const styleId = resolved.styleId;

  const results: ResultItem[] = [];
  let fixed = 0;
  let errors = 0;

  for (const violation of violations) {
    try {
      await aemPost(violation.componentPath, {
        "cq:styleIds": styleId,
        "cq:styleIds@TypeHint": "String[]",
      });
      results.push({
        componentPath: violation.componentPath,
        violationType: violation.violationType,
        status: "fixed",
      });
      fixed += 1;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      results.push({
        componentPath: violation.componentPath,
        violationType: violation.violationType,
        status: "error",
        error: message,
      });
      errors += 1;
    }
  }

  const payload = {
    summary: { total: violations.length, fixed, errors },
    styleApplied: styleId,
    styleInput,
    results,
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
