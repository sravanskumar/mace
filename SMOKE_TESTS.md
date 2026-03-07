# Smoke Tests

**Audience:** Operators. **Use after build** to confirm the MACE server and AEM connectivity. Run each prompt in Claude (MACE MCP enabled); check the observable outcome.

**Assumptions:** Local AEM at **http://localhost:4502** with **WKND** sample content; credentials **admin / admin**. Pass conditions assume this setup.

---

| ID   | Prompt | Pass |
|------|--------|------|
| T01  | `What governance tools do you have available?` | Claude lists 5 tools with descriptions. |
| T02  | `List pages under /content/wknd/language-masters/en` | Response has `totalPages` > 0 and page paths. |
| T03  | `Find wknd/components/teaser style violations under /content/wknd/language-masters/en` | Response has `totalViolations` (number) and `violations` array; no tool error. |
| T03a | `List violations under region /content/wknd/language-masters/en as table. When showing the violations table, use three columns: Component path, Applied styles (violation), Allowed style names (from allowedStyleNames).` | Table has three columns: Component path, Applied styles (violation), Allowed style names. |
| T04  | `List the available styles for wknd/components/teaser on page /content/wknd/language-masters/en` | Response has `resolvedPolicyPath` and `styleGroups` (or style list); no resolution error. |
| T05  | `List the styles in the policy at /conf/wknd/settings/wcm/policies/wknd/components/teaser/policy_1555539430196` | Response has `styleGroups` (or style list) and same path as `resolvedPolicyPath`. |
| T06  | `Find wknd/components/teaser violations under /content/wknd/nonexistent/site` | Error: no governance rule found for region and component type. |
| T07  | `Fix the teaser at /apps/wknd/components/teaser using the style named Default` | Error (e.g. 403 or write denied). On AEMaaCS, 403 expected. |
| T08  | (1) `Find all wknd/components/teaser violations under /content/wknd/language-masters/de` (2) If any, `Fix all violations using the style named Featured` (3) `Find wknd/components/teaser violations under /content/wknd/language-masters/de` | After step 3: `totalViolations` = 0. |
