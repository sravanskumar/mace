/**
 * Run MACE tool handlers with prompt inputs and check response shape against
 * PROMPTS.md acceptance criteria. Requires AEM running and .env set.
 * Run from project root: node scripts/run-acceptance.cjs
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const { handleListPages } = require("../dist/tools/list-pages.js");
const { handleListViolations } = require("../dist/tools/list-violations.js");
const { handleListStyles } = require("../dist/tools/list-styles.js");

function parseTextContent(result) {
  const text = result.content?.[0]?.text;
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function run() {
  const checks = [];
  let failed = false;

  // 1. List pages (T02 / prompt 2)
  try {
    const result = await handleListPages({ regionPath: "/content/wknd/language-masters/en" });
    const data = parseTextContent(result);
    const ok = data && typeof data.totalPages === "number" && Array.isArray(data.pages);
    checks.push({ name: "list_pages (regionPath)", ok, detail: ok ? `totalPages=${data.totalPages}` : (data?.error || "missing totalPages/pages") });
    if (!ok) failed = true;
  } catch (e) {
    checks.push({ name: "list_pages (regionPath)", ok: false, detail: e.message });
    failed = true;
  }

  // 2. List styles by page + componentType (Prompt 1): success with styles OR clear error (permissions/resolution)
  try {
    const result = await handleListStyles({
      pagePath: "/content/wknd/language-masters/en",
      componentType: "wknd/components/teaser",
    });
    const data = parseTextContent(result);
    const success = data && (data.resolvedPolicyPath || data.policyPath) && (data.styleGroups?.length >= 0 || Array.isArray(data.styleGroups)) && !data.error;
    const clearError = data && data.error && (data.styleGroups?.length === 0 || Array.isArray(data.styleGroups));
    const ok = success || clearError;
    checks.push({ name: "list_component_styles (pagePath+componentType)", ok, detail: success ? `resolvedPolicyPath + styleGroups length=${data.styleGroups?.length ?? 0}` : (clearError ? "clear error on resolution (acceptable)" : (data?.error || "unexpected response")) });
    if (!ok) failed = true;
  } catch (e) {
    checks.push({ name: "list_component_styles (pagePath+componentType)", ok: false, detail: e.message });
    failed = true;
  }

  // 3. List styles by policyPath override (Prompt 5)
  try {
    const result = await handleListStyles({
      policyPath: "/conf/wknd/settings/wcm/policies/wknd/components/teaser/policy_1555539430196",
    });
    const data = parseTextContent(result);
    const ok = data && data.resolvedPolicyPath && (data.styleGroups?.length >= 0 || Array.isArray(data.styleGroups)) && !data.error;
    checks.push({ name: "list_component_styles (policyPath override)", ok, detail: ok ? "resolvedPolicyPath + styleGroups" : (data?.error || "missing fields") });
    if (!ok) failed = true;
  } catch (e) {
    checks.push({ name: "list_component_styles (policyPath override)", ok: false, detail: e.message });
    failed = true;
  }

  // 4. List violations – response has allowedStyleNames (Prompt 2)
  try {
    const result = await handleListViolations({ regionPath: "/content/wknd/language-masters/de" });
    const data = parseTextContent(result);
    const ok = data && Array.isArray(data.allowedStyleNames) && typeof data.totalViolations === "number" && Array.isArray(data.violations);
    checks.push({ name: "list_style_violations (allowedStyleNames in response)", ok, detail: ok ? `allowedStyleNames=[${data.allowedStyleNames.join(", ")}], totalViolations=${data.totalViolations}` : (data?.error || "missing allowedStyleNames/violations") });
    if (!ok) failed = true;
  } catch (e) {
    checks.push({ name: "list_style_violations", ok: false, detail: e.message });
    failed = true;
  }

  // 5. Unknown region – error (Prompt 6)
  try {
    const result = await handleListViolations({ regionPath: "/content/wknd/nonexistent/site" });
    const data = parseTextContent(result);
    const ok = data && data.error && /no governance rule found/i.test(data.error);
    checks.push({ name: "list_style_violations (unknown region → error)", ok, detail: ok ? "error message present" : (data?.error || "expected error") });
    if (!ok) failed = true;
  } catch (e) {
    checks.push({ name: "list_style_violations (unknown region)", ok: false, detail: e.message });
    failed = true;
  }

  // Report
  console.log("\nAcceptance checks (tool response shape):\n");
  checks.forEach((c) => console.log(`${c.ok ? "  ✓" : "  ✗"} ${c.name}\n      ${c.detail}`));
  console.log("");
  if (failed) {
    console.error("Some checks failed. Ensure AEM is running at AEM_BASE_URL and .env is set (see .env.example).\n");
    process.exit(1);
  }
  console.log("All acceptance checks passed.\n");
}

run().catch((err) => {
  console.error("Run failed:", err.message);
  console.error("Ensure AEM is running and .env is set (copy .env.example to .env).\n");
  process.exit(1);
});
