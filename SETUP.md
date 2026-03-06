# MACE setup guide

MACE (MCP-Assisted Content Enforcement) exposes AEM governance tools over the Model Context Protocol. This guide covers prerequisites, configuration, and adding the server to Claude Desktop or Cursor.

## Prerequisites

- **Node.js** 18+ (for running the built server).
- **npm** (to install dependencies and build).
- An **AEM Author** instance (e.g. AEM as a Cloud Service SDK or local 4502) with content and a system user for API access.
- **Credentials** for an AEM user with read/write access to the content and policies you will govern.

Install dependencies and build:

```bash
npm install
npm run build
```

## Configure (.env and governance-rules.json)

### Environment variables

Create a `.env` file in the project root (or set these in the MCP client config). Required:

| Variable | Description | Example |
|----------|-------------|---------|
| `AEM_BASE_URL` | AEM Author URL | `http://localhost:4502` |
| `AEM_USERNAME` | AEM user (e.g. system user) | `wknd-governance-service` |
| `AEM_PASSWORD` | Password for that user | *(set securely)* |

Optional:

| Variable | Description | Default |
|----------|-------------|---------|
| `AEM_TIMEOUT_MS` | HTTP timeout in ms | `30000` |
| `AEM_MAX_PAGES` | Max pages returned by list_pages | `500` |
| `TRAVERSAL_DEPTH` | Depth when scanning for Teaser components | `10` |
| `GOVERNANCE_RULES_PATH` | Path to governance rules JSON | `./governance-rules.json` |

### Governance rules

Place `governance-rules.json` in the project root (or set `GOVERNANCE_RULES_PATH` to its path). It defines regions, component types, and allowed style IDs. Example shape:

```json
{
  "version": "1.0",
  "description": "Regional Teaser style governance rules",
  "rules": [
    {
      "region": "/content/wknd/us/en",
      "componentType": "teaser",
      "allowedStyleIds": ["item0", "item1"],
      "policyPath": "/conf/wknd/settings/wcm/policies/.../teaser/policy_...",
      "notes": "Optional"
    }
  ]
}
```

Adjust `region`, `componentType`, `allowedStyleIds`, and `policyPath` to match your AEM setup.

## Add to Claude Desktop (with OS-specific config file paths)

1. Copy `claude_desktop_config_example.json` from this repo and open your **Claude Desktop** config file:
   - **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
   - **Linux:** `~/.config/Claude/claude_desktop_config.json`
2. Replace `/REPLACE_WITH_ABSOLUTE_PATH_TO/mace/dist/index.js` in the `args` array with the **absolute path** to your MACE `dist/index.js` (e.g. `/Users/you/projects/mace/dist/index.js`).
3. Set `AEM_PASSWORD` in the `env` block (or rely on `.env` if your client loads it; Claude Desktop uses the `env` in the config).
4. Merge the `mace` entry into the existing `mcpServers` object if you already have other servers.
5. Fully **quit and restart** Claude Desktop (not just close the window) so the new MCP server is loaded.

## Add to Cursor (Settings > Features > MCP > Add Server)

1. Open **Cursor Settings** (e.g. **Cmd+,** on macOS, **Ctrl+,** on Windows/Linux).
2. Go to **Features** (or **Tools & MCP**) → **MCP**.
3. Click **Add new MCP server** (or **Add Server**).
4. Configure:
   - **Name:** `mace` (or any label you prefer).
   - **Type:** Command / CLI.
   - **Command:** `node`
   - **Arguments:** full path to `dist/index.js`, e.g. `/Users/you/projects/mace/dist/index.js`
   - **Env:** add the same keys as in the example (`AEM_BASE_URL`, `AEM_USERNAME`, `AEM_PASSWORD`, and optionally `AEM_MAX_PAGES`, `TRAVERSAL_DEPTH`). Alternatively use a project `.env` if Cursor loads it for the MCP process.
5. Save and **restart Cursor** so the server is picked up.

(You can also add the same `mace` block to `.cursor/mcp.json` in the project or `~/.cursor/mcp.json` if you prefer JSON config.)

## Verify (confirm 5 tools visible in tool picker)

After adding MACE and restarting the client, confirm that **5 tools** are available in the tool picker (or equivalent):

| Tool | Purpose |
|------|---------|
| `list_pages` | List cq:Page paths under a region |
| `list_teaser_style_violations` | Scan Teaser components and report style violations |
| `list_component_styles` | List styles in a content policy |
| `update_component_style` | Set cq:styleIds on a single component |
| `fix_teaser_style_violations` | Bulk-fix violations with a chosen style ID |

If any tool is missing, check MCP logs (e.g. Cursor: **Output** panel → MCP), ensure `dist/index.js` runs with `node dist/index.js` and exits only when credentials are missing (or stays running with valid credentials), and that the client config path and `env` are correct.
