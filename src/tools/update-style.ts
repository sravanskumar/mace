import "dotenv/config";
import { z } from "zod";
import { aemGet } from "../aem-client.js";
import { aemPost } from "../aem-client.js";
import { resolveStyleToId } from "../policy-styles.js";
import { getPolicyPathForPageComponent } from "../template-policy-resolver.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const inputSchema = z.object({
  componentPath: z.string(),
  styleId: z.string(),
});

function pagePathFromComponentPath(componentPath: string): string {
  const idx = componentPath.indexOf("/jcr:content");
  return idx > 0 ? componentPath.slice(0, idx) : componentPath;
}

export const updateStyleTool: Tool = {
  name: "update_component_style",
  description:
    "Apply a style to a single AEM component by setting cq:styleIds. Prefer style by name (e.g. Default, Featured); use cq:styleId only as fallback.",
  inputSchema: {
    type: "object" as const,
    properties: {
      componentPath: {
        type: "string" as const,
        description: "JCR path of the component node to update",
      },
      styleId: {
        type: "string" as const,
        description:
          "Style name (preferred) or cq:styleId. Use names like Default, Featured from list_component_styles; IDs are fallback only.",
      },
    },
    required: ["componentPath", "styleId"],
  },
};

export async function handleUpdateStyle(
  args: Record<string, unknown>
): Promise<CallToolResult> {
  const { componentPath, styleId: styleInput } = inputSchema.parse(args);

  const pagePath = pagePathFromComponentPath(componentPath);
  const policyPath = await getPolicyPathForPageComponent(
    pagePath,
    "wknd/components/teaser",
    aemGet
  );
  if (!policyPath) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error:
              "Could not resolve template→policy for the component's page. Ensure the page uses a template with a policy mapping for wknd/components/teaser.",
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

  await aemPost(componentPath, {
    "cq:styleIds": styleId,
    "cq:styleIds@TypeHint": "String[]",
  });

  const payload = {
    status: "success" as const,
    componentPath,
    appliedStyle: styleId,
    styleInput,
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
