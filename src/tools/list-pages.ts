import "dotenv/config";
import { z } from "zod";
import { aemGet } from "../aem-client.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const MAX_PAGES = parseInt(process.env.AEM_MAX_PAGES ?? "500", 10);

const inputSchema = z.object({
  regionPath: z.string(),
});

type QueryBuilderHit = { "jcr:path"?: string };
type QueryBuilderResponse = { hits?: QueryBuilderHit[] };

export const listPagesTool: Tool = {
  name: "list_pages",
  description: "List all cq:Page paths under a given AEM content path.",
  inputSchema: {
    type: "object" as const,
    properties: {
      regionPath: { type: "string" as const, description: "AEM content path to list pages under" },
    },
    required: ["regionPath"],
  },
};

export async function handleListPages(
  args: Record<string, unknown>
): Promise<CallToolResult> {
  const { regionPath } = inputSchema.parse(args);

  const response = await aemGet<QueryBuilderResponse>("/bin/querybuilder.json", {
    path: regionPath,
    type: "cq:Page",
    "p.limit": String(MAX_PAGES),
    "p.hits": "selective",
    "p.properties": "jcr:path",
  });

  const pages: string[] = (response.hits ?? []).map((hit) => hit["jcr:path"] ?? "").filter(Boolean);
  const totalPages = pages.length;

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ regionPath, totalPages, pages }, null, 2),
      },
    ],
  };
}
