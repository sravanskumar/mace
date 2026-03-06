import "dotenv/config";
import { z } from "zod";
import { aemPost } from "../aem-client.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const inputSchema = z.object({
  componentPath: z.string(),
  styleId: z.string(),
});

export const updateStyleTool: Tool = {
  name: "update_component_style",
  description:
    "Apply a style to a single AEM component by setting cq:styleIds.",
  inputSchema: {
    type: "object" as const,
    properties: {
      componentPath: {
        type: "string" as const,
        description: "JCR path of the component node to update",
      },
      styleId: {
        type: "string" as const,
        description: "Style ID to apply (e.g. from list_component_styles)",
      },
    },
    required: ["componentPath", "styleId"],
  },
};

export async function handleUpdateStyle(
  args: Record<string, unknown>
): Promise<CallToolResult> {
  const { componentPath, styleId } = inputSchema.parse(args);

  await aemPost(componentPath, {
    "cq:styleIds": styleId,
    "cq:styleIds@TypeHint": "String[]",
  });

  const payload = {
    status: "success" as const,
    componentPath,
    appliedStyle: styleId,
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
