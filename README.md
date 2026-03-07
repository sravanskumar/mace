# MACE — MCP-Assisted Content Enforcement for AEM

MACE is an MCP server that helps enforce regional content governance on Adobe Experience Manager (AEM) using native APIs only (no custom AEM code). Use it from Claude Desktop or Cursor to list pages, scan for style violations, inspect policies, and fix violations via natural language.

## Quick start (local AEM + WKND)

Assumes a **local AEM Author** instance (e.g. SDK) at **http://localhost:4502** with **WKND** sample content and default credentials **admin / admin**.

1. **Clone and build**
   ```bash
   git clone <this-repo-url>
   cd mace
   npm install
   npm run build
   ```

2. **Configure AEM connection**  
   Copy `.env.example` to `.env`. For local WKND the defaults (localhost:4502, admin/admin) are fine; change them if your instance differs.

3. **Add MACE to Claude Desktop or Cursor**  
   Use `claude_desktop_config_example.json` as a template: replace the path in `args` with the **absolute path** to your `dist/index.js`. Credentials are read from the project’s `.env` (so you don’t need to set them in the MCP config). See [SETUP.md](SETUP.md) for step-by-step instructions.

4. **Restart** your client and confirm **5 tools** appear.

5. **Run a prompt** from [PROMPTS.md](PROMPTS.md) (developer acceptance criteria) or [SMOKE_TESTS.md](SMOKE_TESTS.md) (operator pass/fail). Example: *"List pages under /content/wknd/language-masters/en"* — you should see a list of pages. For violations as a table with Component path, Applied styles (violation), and Allowed style names, see PROMPTS.md §3e. Expected output for all prompts assumes the same local AEM + WKND setup.

**Prerequisites:** Node.js 18+, npm, and a running AEM Author with WKND (or adjust `.env` and your governance rules for your site).

For production or to **enforce user-level permissions** (e.g. allow reads but restrict writes to certain paths), use a **dedicated service user** instead of admin. See [SETUP.md](SETUP.md#service-user-recommended-for-production) for how to create one and which permissions MACE needs.

## Governance rules

Rules are read from **`governance-rules.json`** in the **project root** (same folder as `.env`) by default. Copy **`governance-rules.example.json`** to **`governance-rules.json`** there, then edit. See [SETUP.md](SETUP.md) for the exact steps and the optional **`GOVERNANCE_RULES_PATH`** override.

- **Style names, not JCR IDs:** Use **`allowedStyleNames`** — style labels (e.g. `"Default"`, `"Featured"`) as in the AEM UI and `list_component_styles`. The server resolves them to style IDs internally.
- **Case-insensitive:** Style name matching is case-insensitive.
- **Optional policy path:** Per-component `policyPath` (or region-level) can be set; if omitted, the server resolves the policy from the page template.
- **Multiple components per region:** Each rule has a `components` array with `type` (e.g. `wknd/components/teaser`) and `allowedStyleNames` per component.

See **`governance-rules.example.json`** in the repo and [SETUP.md](SETUP.md) for the full schema and configuration options.

## Docs

| Doc | Purpose |
|-----|--------|
| [SETUP.md](SETUP.md) | Prerequisites, env vars, adding MACE to Claude Desktop or Cursor. |
| [PROMPTS.md](PROMPTS.md) | Prompts + acceptance criteria for developers (used during build). |
| [SMOKE_TESTS.md](SMOKE_TESTS.md) | Observable end-to-end tests for operators (used after build). |
