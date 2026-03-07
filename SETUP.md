# MACE setup guide

MACE (MCP-Assisted Content Enforcement) exposes AEM governance tools over the Model Context Protocol. This guide covers prerequisites, configuration, and adding the server to Claude Desktop or Cursor.

**Default for local AEM + WKND:** URL **http://localhost:4502**, credentials **admin / admin**. Copy `.env.example` to `.env` and you can run without changing anything.

**.env in the project is the single source of truth.** The server loads `.env` from the project root (relative to the built `dist/` folder), so it works the same whether you run from the terminal, Claude Desktop, Cursor, or CI. You do not need to duplicate credentials in the MCP client config — only the path to `dist/index.js` is required there.

## Prerequisites

- **Node.js** 18+ (for running the built server).
- **npm** (to install dependencies and build).
- An **AEM Author** instance with content for governance. For the quick start and the prompts in this repo: local AEM at **http://localhost:4502** with **WKND** sample content and **admin / admin** credentials.

Install dependencies and build:

```bash
npm install
npm run build
```

## Configure (.env and governance-rules.json)

### Environment variables

Copy **`.env.example`** to **`.env`** in the project root. The server always loads `.env` from the project root, regardless of the process working directory (so Claude Desktop and Cursor do not need env vars in their MCP config). Required:

| Variable | Description | Default (local WKND) |
|----------|-------------|----------------------|
| `AEM_BASE_URL` | AEM Author URL | `http://localhost:4502` |
| `AEM_USERNAME` | AEM user | `admin` for local; use a **service user** in production (see below) |
| `AEM_PASSWORD` | Password for that user | `admin` for local; set securely for service user |

Optional:

| Variable | Description | Default |
|----------|-------------|---------|
| `AEM_TIMEOUT_MS` | HTTP timeout in ms | `30000` |
| `AEM_MAX_PAGES` | Max pages returned by list_pages | `500` |
| `TRAVERSAL_DEPTH` | Depth when scanning for components | `10` |
| `GOVERNANCE_RULES_PATH` | Path to governance rules JSON (absolute, or relative to project root). Omit to use default. | `governance-rules.json` (project root) |
| `MACE_LOG_AEM` | Log every AEM request and full response body to stderr (`1` or `true` to enable) | unset |
| `MACE_LOG_AEM_FILE` | Also append the same log to this file (e.g. `./mace-aem.log`) so you can `tail -f` it | unset |
| `MACE_LOG_AEM_MAX_BODY` | Max chars of response body to log; 0 = no limit (truncated beyond this) | `15000` |

### Governance rules

**Default path:** The server reads governance rules from **`governance-rules.json`** in the **project root** (same folder as `.env`).

**Setup:**

1. Copy the example file to the project root and rename:
   ```bash
   cp governance-rules.example.json governance-rules.json
   ```
2. Edit **`governance-rules.json`** for your regions, components, and allowed styles.

**Override the path:** Set **`GOVERNANCE_RULES_PATH`** in `.env` to an absolute path or a path relative to the project root (e.g. `config/my-rules.json`).

The example file (version 1.1) is WKND-oriented: one rule per region with a **`components`** array. Each component entry has **`type`** (e.g. `wknd/components/teaser`) and **`allowedStyleNames`** (style labels). Optional **`policyPath`** per component (or at region level) overrides dynamic policy resolution.

Example shape:

```json
{
  "version": "1.1",
  "description": "Regional style governance",
  "rules": [
    {
      "region": "/content/wknd/language-masters/en",
      "components": [
        {
          "type": "wknd/components/teaser",
          "allowedStyleNames": ["Default", "Featured"],
          "policyPath": "/conf/wknd/settings/wcm/policies/.../teaser/policy_..."
        }
      ]
    }
  ]
}
```

Adjust **region**, **components**, and **policyPath** to match your AEM site. Use **style labels** (e.g. from `list_component_styles`) in **allowedStyleNames**, not JCR node names.

## Service user (recommended for production)

Using a **dedicated service user** instead of admin enforces **user-level permissions**: MACE can only read and write what that user is allowed to, so you can restrict writes to content (e.g. `/content/wknd`) and deny access to `/apps`, `/conf` (except read where needed), or other sensitive paths.

### Permissions MACE needs

| Operation | Path / resource | Permission |
|-----------|------------------|------------|
| List pages, scan violations, list styles | `/content/<your-site>` (and descendants) | **Read** |
| Resolve template → policy | Page `jcr:content` (e.g. `cq:template`, `cq:conf`), template `policies` | **Read** |
| Read policy styles | `/conf/<tenant>/settings/wcm/policies/...` | **Read** |
| Fix violations / update component style | Component nodes under `/content/...` (e.g. `cq:styleIds`) | **Read + Write** |

MACE does **not** need write access to `/apps`, `/conf` (only read for policies), or the repository root. Deny write to `/apps` so that the “security gate” smoke test (e.g. fix at `/apps/...`) correctly returns 403.

### Creating a service user in AEM

1. In AEM **User Management** (or CRX User Admin), create a user (e.g. `mace-governance-service` or `wknd-governance-service`).
2. Set a strong password and store it securely (e.g. in your MCP client `env` or a secrets manager); do not commit it to the repo.
3. Grant the user:
   - **Read** on the content tree you govern (e.g. `/content/wknd`) and on the templates and policies used by those pages (e.g. `/conf/wknd` for template and policy reads).
   - **Read + Write** only on the content paths where MACE may apply fixes (typically the same content tree, e.g. `/content/wknd`), so the user can update `cq:styleIds` on component nodes.
   - **No write** on `/apps` (and optionally no write on `/conf` if you do not want any config changes).

After creating the user, set **`AEM_USERNAME`** and **`AEM_PASSWORD`** in `.env` or in your Claude Desktop / Cursor MCP server `env` to this service user’s credentials. MACE will then run with that user’s permissions; any operation outside those permissions will return errors (e.g. 403), which you can use to validate your permission model.

## Add to Claude Desktop (with OS-specific config file paths)

1. Copy **`claude_desktop_config_example.json`** from this repo and open your **Claude Desktop** config file:
   - **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
   - **Linux:** `~/.config/Claude/claude_desktop_config.json`
2. Replace **`/REPLACE_WITH_ABSOLUTE_PATH_TO/mace/dist/index.js`** in the `args` array with the **absolute path** to your MACE **`dist/index.js`** (e.g. `/Users/you/projects/mace/dist/index.js`).
3. Credentials are read from the project’s **`.env`** (see above); you do not need to set `AEM_*` in the MCP config unless you want to override. For local WKND, copy `.env.example` to `.env` and you’re set.
4. Merge the **`mace`** entry into your existing **`mcpServers`** object if you have other servers.
5. Fully **quit and restart** Claude Desktop so the new MCP server is loaded.

## Add to Cursor (Settings > Features > MCP > Add Server)

1. Open **Cursor Settings** (e.g. **Cmd+,** on macOS, **Ctrl+,** on Windows/Linux).
2. Go to **Features** (or **Tools & MCP**) → **MCP**.
3. Click **Add new MCP server** (or **Add Server**).
4. Configure:
   - **Name:** `mace` (or any label).
   - **Type:** Command / CLI.
   - **Command:** `node`
   - **Arguments:** full path to **`dist/index.js`**, e.g. `/Users/you/projects/mace/dist/index.js`
   - **Env:** optional. The server loads credentials from the project’s `.env`; add env vars here only if you want to override (e.g. for a different instance).
5. Save and **restart Cursor**.

(You can also add the same `mace` block to `.cursor/mcp.json` in the project or `~/.cursor/mcp.json`.)

## Verify (confirm 5 tools visible)

After adding MACE and restarting the client, confirm **5 tools** are available:

| Tool | Purpose |
|------|--------|
| `list_pages` | List cq:Page paths under a region |
| `list_style_violations` | Scan governed components for style violations. With **regionPath**, scans the region page itself and all descendant pages; page count and violations include the region path. |
| `list_component_styles` | List styles in a content policy (by page+component or policy path) |
| `update_component_style` | Set cq:styleIds on a single component |
| `fix_style_violations` | Bulk-fix violations with a chosen style |

If any tool is missing, check MCP logs (e.g. Cursor: **Output** → MCP), ensure the path to `dist/index.js` and env vars are correct, and that AEM is reachable with the given credentials.
