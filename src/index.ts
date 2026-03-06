import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { listPagesTool, handleListPages } from "./tools/list-pages.js";
import { listViolationsTool, handleListViolations } from "./tools/list-violations.js";
import { listStylesTool, handleListStyles } from "./tools/list-styles.js";
import { updateStyleTool, handleUpdateStyle } from "./tools/update-style.js";
import { fixViolationsTool, handleFixViolations } from "./tools/fix-violations.js";

const server = new Server(
  { name: "mace", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

const allTools = [
  listPagesTool,
  listViolationsTool,
  listStylesTool,
  updateStyleTool,
  fixViolationsTool,
];

server.setRequestHandler(ListToolsRequestSchema, () => {
  return { tools: allTools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  switch (name) {
    case "list_pages":
      return handleListPages(request.params.arguments ?? {});
    case "list_teaser_style_violations":
      return handleListViolations(request.params.arguments ?? {});
    case "list_component_styles":
      return handleListStyles(request.params.arguments ?? {});
    case "update_component_style":
      return handleUpdateStyle(request.params.arguments ?? {});
    case "fix_teaser_style_violations":
      return handleFixViolations(request.params.arguments ?? {});
    default:
      throw new Error("Unknown tool: " + name);
  }
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AEM Governance MCP Server ready");
}

main().catch(console.error);
