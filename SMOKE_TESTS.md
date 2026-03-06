# Smoke Tests

Use these prompts in Claude (with the MACE MCP server enabled) to verify tool registration, AEM connectivity, and governance behavior.

---

## T01 — Tool Registration

**Prompt:** `What governance tools do you have available?`

**Expected:** Claude lists all 5 tools with descriptions.

**If it fails:** Check MCP server config (e.g. `claude_desktop_config.json`), ensure the MACE server is enabled and the path to the server binary/script is correct. Restart Claude Desktop after config changes.

---

## T02 — Page Listing

**Prompt:** `List pages under /content/wknd/us/en` (or `List pages under /content/wknd/language-masters/en` for WKND language masters).

**Expected:** A list of pages under the path — e.g. `totalPages` > 0 and page paths. Claude may show raw JSON or a formatted summary (e.g. by section).

**If it fails:** Verify AEM base URL and auth (API key or credentials) in config. Confirm the content path exists on the target instance (e.g. `/content/wknd/us/en` or `/content/wknd/language-masters/en`). Check network/firewall if connection times out.

---

## T03 — Violation Scan

**Prompt:** `Find teaser style violations under /content/wknd/us/en`

**Expected:** Either 0 violations or a structured violation list.

**If it fails:** Ensure `governance-rules.json` (or equivalent) defines a rule for the region (e.g. `wknd/us/en`). Confirm policy path and component paths in the rule are correct. Check that list-violations and list-pages tools are working.

---

## T04 — Style Inspection

**Prompt:** `What styles are defined in the policy at [paste your policyPath]?`

**Expected:** List of style groups and styles with IDs, titles, CSS classes.

**If it fails:** Replace `[paste your policyPath]` with the actual policy path (e.g. from T02/T03 output). Verify read access to the policy node. Ensure list-styles tool is registered and the policy path format is correct for your AEM version.

---

## T05 — Security Gate (403 check)

**Prompt:** `Fix the teaser at /apps/wknd/components/teaser using style item0`

**Expected:** Error — AEMaaCS returns 403 (no write permission on /apps).

**If it fails:** If you get success or a different error, the test environment may have write access to `/apps` (e.g. local SDK). For AEMaaCS, 403 confirms the security gate is enforced.

---

## T06 — Unknown Region

**Prompt:** `Find teaser violations under /content/wknd/ch/de`

**Expected:** Clean message — no governance rule found for this region.

**If it fails:** If you get violations or a generic error, check that governance resolution uses the content path/region and returns a clear “no rule” message for unconfigured regions (e.g. `ch/de`).

---

## Full Governance Cycle

Run in order in the same session:

1. **Step 1:** `Find all teaser violations under /content/wknd/de/de`
2. **Step 2:** `What styles are valid at [policyPath from step 1]?`
3. **Step 3:** `Fix all violations using Default (item0)`
4. **Step 4:** `Scan /content/wknd/de/de for violations again`

**Expected after step 4:** `totalViolations` = 0.

**If it fails:** Confirm the region `wknd/de/de` has a governance rule and policy path. Ensure fix-violations uses the same policy and style IDs as list-styles. Re-run from step 1 if content or rules changed mid-cycle.
