# MACE — Context for AI Assistants

This file gives Claude (and other AI tools) concise context when working in this repository.

## What MACE is

**MACE** (MCP-Assisted Content Enforcement) is an **MCP server** that enforces **regional content governance** on **Adobe Experience Manager (AEM)** using **native AEM APIs only** (no custom AEM code). It is used from **Claude Desktop** or **Cursor**: users run natural-language prompts that map to tools (list pages, scan violations, list styles, fix violations). Governance rules are defined in a JSON file; the server resolves policies from page templates when not explicitly set.

## Tech stack

- **Runtime:** Node.js 18+
- **Language:** TypeScript (compiled to `dist/`)
- **Protocol:** Model Context Protocol (MCP), stdio transport
- **AEM:** HTTP only — QueryBuilder, Sling GET (.infinity.json), Sling POST. No Maven, no custom AEM bundles.

## Repository layout

| Path | Purpose |
|------|--------|
| `src/index.ts` | MCP server entry; registers 5 tools and routes `CallTool` to handlers. |
| `src/governance-config.ts` | Loads and parses `governance-rules.json`; rule/component lookup; no restart needed for rule changes. |
| `src/aem-client.ts` | HTTP client for AEM (GET/POST); uses `.env` for URL and credentials. |
| `src/template-policy-resolver.ts` | Resolves Content Policy path from page template (cq:template → policies → component mapping). |
| `src/policy-styles.ts` | Fetches policy styles (cq:styleGroups) and resolves style label ↔ ID. |
| `src/tools/*.ts` | One file per tool: list-pages, list-violations, list-styles, update-style, fix-violations. |
| `governance-rules.example.json` | Example governance rules (v1.1 schema). Users copy to `governance-rules.json` (gitignored). |
| `.env` | AEM URL, credentials, timeouts; loaded from project root. Not committed. |
| `scripts/run-acceptance.cjs` | Acceptance script that calls tool handlers against a live AEM (requires AEM + .env). |
| `docs/MACE-UseCase-Architecture.pdf` | Architecture and setup documentation. |

## MCP tools (5)

1. **list_pages** — List cq:Page paths under a region (QueryBuilder).
2. **list_style_violations** — Scan governed components for style violations; supports `pagePath` (single page) or `regionPath` (page + descendants); optional `componentType`; uses governance rules and policy resolution.
3. **list_component_styles** — List styles (styleLabel, styleId, styleClasses) for a component; accepts `pagePath` + `componentType` (policy resolved from template) or `policyPath` override.
4. **update_component_style** — Set cq:styleIds on a single component (Sling POST).
5. **fix_style_violations** — Bulk-fix violations from `list_style_violations` using a chosen style (by name or ID).

Governance rules use **allowedStyleNames** (style labels); the server resolves names to IDs. Violation types: `REGION_VIOLATION`, `POLICY_MISCONFIGURATION`, `NO_STYLE`.

## Configuration

- **AEM:** `AEM_BASE_URL`, `AEM_USERNAME`, `AEM_PASSWORD` in `.env` (required). Optional: `AEM_TIMEOUT_MS`, `AEM_MAX_PAGES`, `TRAVERSAL_DEPTH`, `GOVERNANCE_RULES_PATH`, `MACE_LOG_*`.
- **Governance rules:** Default path is `governance-rules.json` in the **project root** (same folder as `.env`). Copy from `governance-rules.example.json`. Optional `policyPath` per component or per region; if omitted, policy is resolved from the page template per (page, component type).
- **MCP client:** Only the path to `dist/index.js` is required in Claude Desktop / Cursor; credentials come from the project `.env`.

## Commands

- `npm run build` — Compile TypeScript to `dist/`.
- `npm test` — Build + run `template-policy-resolver` unit tests.
- `npm run acceptance` — Build + run acceptance script (requires running AEM and `.env`).
- `npm run dev` — Run server via ts-node (development).

## Conventions and gotchas

- **Governance schema:** v1.1 uses `rules[].components[]` with `type` (fully qualified resource type, e.g. `wknd/components/teaser`) and `allowedStyleNames` (style labels). Do not rely on deprecated `allowedStyleIds`.
- **Paths:** Project root is derived from `dist/` at runtime (`MACE_PROJECT_ROOT`); `.env` and default `governance-rules.json` are under that root.
- **Do not commit:** `.env`, `governance-rules.json`, `files/`, `*.docx`, `mace-aem.log`. See `.gitignore`.
- **Releases:** release-please manages versions and CHANGELOG; CI and release-artifact workflows run on GitHub.

## Key docs for humans

- [README.md](README.md) — Overview and quick start.
- [SETUP.md](SETUP.md) — Prerequisites, env vars, adding MACE to Claude/Cursor, service user.
- [PROMPTS.md](PROMPTS.md) — Example prompts and acceptance criteria for tools.
- [SMOKE_TESTS.md](SMOKE_TESTS.md) — Operator-oriented smoke tests.
- [docs/MACE-UseCase-Architecture.pdf](docs/MACE-UseCase-Architecture.pdf) — Use-case and architecture (v2.2).
