import "dotenv/config";
import { z } from "zod";
import { aemGet } from "../aem-client.js";
import { getPolicyStyles } from "../policy-styles.js";
import { getPolicyPathForPageComponent } from "../template-policy-resolver.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const inputSchema = z
  .object({
    pagePath: z.string().optional(),
    componentType: z.string().optional(),
    policyPath: z.string().optional(),
  })
  .refine(
    (data) => {
      const hasPolicy = Boolean(data.policyPath?.trim());
      const hasPageAndComponent =
        Boolean(data.pagePath?.trim()) && Boolean(data.componentType?.trim());
      return hasPolicy || hasPageAndComponent;
    },
    {
      message:
        "Either provide policyPath, or both pagePath and componentType.",
    }
  );

/** Style entry returned to callers (uses AEM property names for clarity). */
export type StyleEntry = import("../policy-styles.js").PolicyStyleEntryWithNodeName;

export const listStylesTool: Tool = {
  name: "list_component_styles",
  description:
    "List all styles available for a component on a page (styleLabel, styleId, styleClasses per style). Primary use: pass pagePath and componentType (e.g. wknd/components/teaser); the policy path is resolved automatically. Use style names (labels) in governance rules (allowedStyleNames) and when fixing violations; IDs are for reference only. Optional: pass policyPath to bypass resolution when you already have it (e.g. from a violation report).",
  inputSchema: {
    type: "object" as const,
    properties: {
      pagePath: {
        type: "string" as const,
        description:
          "AEM page path (e.g. /content/wknd/language-masters/en or /content/wknd/language-masters/en/faqs). Required when policyPath is not supplied.",
      },
      componentType: {
        type: "string" as const,
        description:
          "Fully qualified component resource type (e.g. wknd/components/teaser, wknd/components/hero). Required when policyPath is not supplied.",
      },
      policyPath: {
        type: "string" as const,
        description:
          "Optional override: path to the content policy. When supplied, resolution is skipped and this path is used directly (e.g. from a previous violation report).",
      },
    },
    required: [],
  },
};

export async function handleListStyles(
  args: Record<string, unknown>
): Promise<CallToolResult> {
  const parsed = inputSchema.safeParse(args);
  if (!parsed.success) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              error: "Invalid input",
              details: parsed.error.message,
              hint: "Provide either policyPath, or both pagePath and componentType.",
            },
            null,
            2
          ),
        },
      ],
    };
  }

  const { pagePath, componentType, policyPath } = parsed.data;

  let resolvedPolicyPath: string | null = null;

  if (policyPath?.trim()) {
    resolvedPolicyPath = policyPath.trim();
  } else if (pagePath?.trim() && componentType?.trim()) {
    resolvedPolicyPath = await getPolicyPathForPageComponent(
      pagePath.trim(),
      componentType.trim(),
      aemGet
    );
    if (!resolvedPolicyPath) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                pagePath: pagePath.trim(),
                componentType: componentType.trim(),
                resolvedPolicyPath: null,
                styleGroups: [],
                error:
                  "Could not resolve the content policy for this page and component. The page may not exist, the template may have no policy mapping for this component, or the service user may lack read permission on the page or template. No styles were found; missing results may indicate a permissions issue.",
                note: "Use these style names in allowedStyleNames and when fixing violations.",
              },
              null,
              2
            ),
          },
        ],
      };
    }
  } else {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              error: "Invalid input",
              hint: "Provide either policyPath, or both pagePath and componentType.",
            },
            null,
            2
          ),
        },
      ],
    };
  }

  try {
    const { groups } = await getPolicyStyles(resolvedPolicyPath, aemGet);
    const payload = {
      ...(pagePath?.trim() && componentType?.trim()
        ? { pagePath: pagePath.trim(), componentType: componentType.trim() }
        : {}),
      resolvedPolicyPath: resolvedPolicyPath,
      styleGroups: groups,
      note: "Use these style names in allowedStyleNames and when fixing violations.",
    };

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(payload, null, 2),
        },
      ],
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              ...(pagePath?.trim() && componentType?.trim()
                ? { pagePath: pagePath.trim(), componentType: componentType.trim() }
                : {}),
              resolvedPolicyPath: resolvedPolicyPath,
              styleGroups: [],
              error: `Failed to load or parse the content policy: ${message}. No styles were found; missing results may indicate a permissions issue (e.g. service user cannot read the policy node).`,
              note: "Use these style names in allowedStyleNames and when fixing violations.",
            },
            null,
            2
          ),
        },
      ],
    };
  }
}
