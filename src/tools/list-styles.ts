import "dotenv/config";
import { z } from "zod";
import { aemGet } from "../aem-client.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const inputSchema = z.object({
  policyPath: z.string(),
});

type PolicyStyle = Record<string, unknown>;
type PolicyStyleGroup = { "cq:title"?: string; "cq:styles"?: Record<string, PolicyStyle> };
type PolicyResponse = { "cq:styleGroups"?: Record<string, PolicyStyleGroup> };

export const listStylesTool: Tool = {
  name: "list_component_styles",
  description:
    "List all styles in an AEM Content Policy. Use policyPath from a violation report.",
  inputSchema: {
    type: "object" as const,
    properties: {
      policyPath: {
        type: "string" as const,
        description: "Path to the content policy (e.g. from a violation report)",
      },
    },
    required: ["policyPath"],
  },
};

export async function handleListStyles(
  args: Record<string, unknown>
): Promise<CallToolResult> {
  const { policyPath } = inputSchema.parse(args);

  const policy = await aemGet<PolicyResponse>(`${policyPath}.infinity.json`);
  const styleGroupsRaw = policy["cq:styleGroups"] ?? {};
  const styleGroups = Object.entries(styleGroupsRaw).map(
    ([groupId, group]: [string, PolicyStyleGroup]) => {
      const groupTitle = (group["cq:title"] as string) ?? "";
      const stylesRaw = group["cq:styles"] ?? {};
      const styles = Object.entries(stylesRaw).map(
        ([id, style]: [string, PolicyStyle]) => ({
          id,
          title: (style["cq:title"] as string) ?? "",
          cssClass: (style["cq:cssClass"] as string) ?? "",
        })
      );
      return { groupId, groupTitle, styles };
    }
  );

  const payload = { policyPath, styleGroups };

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}
