import "dotenv/config";
import { z } from "zod";
import { aemPost } from "../aem-client.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const violationSchema = z.object({
  componentPath: z.string(),
  violationType: z.string(),
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
  name: "fix_teaser_style_violations",
  description:
    "Bulk-fix all violations from list_teaser_style_violations.",
  inputSchema: {
    type: "object" as const,
    properties: {
      violations: {
        type: "array" as const,
        description: "Array of { componentPath, violationType } from list_teaser_style_violations",
        items: {
          type: "object" as const,
          properties: {
            componentPath: { type: "string" as const },
            violationType: { type: "string" as const },
          },
          required: ["componentPath", "violationType"],
        },
      },
      styleId: {
        type: "string" as const,
        description: "Style ID to apply to each component",
      },
    },
    required: ["violations", "styleId"],
  },
};

export async function handleFixViolations(
  args: Record<string, unknown>
): Promise<CallToolResult> {
  const { violations, styleId } = inputSchema.parse(args);

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
