/**
 * Policy resolution: path construction, lookups, and returned data.
 * Run from project root: node scripts/debug-policy-resolution.cjs [pagePath] [componentType]
 * Example: node scripts/debug-policy-resolution.cjs /content/wknd/language-masters/en wknd/components/teaser
 *
 * Requires AEM running and .env set (AEM_BASE_URL, AEM_USERNAME, AEM_PASSWORD).
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const pagePath = process.argv[2] || "/content/wknd/language-masters/en";
const componentType = process.argv[3] || "wknd/components/teaser";

const axios = require("axios");
const AEM_BASE_URL = (process.env.AEM_BASE_URL || "http://localhost:4502").replace(/\/$/, "");
const AEM_USERNAME = process.env.AEM_USERNAME || "";
const AEM_PASSWORD = process.env.AEM_PASSWORD || "";

if (!AEM_USERNAME || !AEM_PASSWORD) {
  console.error("Set AEM_USERNAME and AEM_PASSWORD in .env");
  process.exit(1);
}

const client = axios.create({
  baseURL: AEM_BASE_URL,
  auth: { username: AEM_USERNAME, password: AEM_PASSWORD },
  timeout: 15000,
});

async function aemGet(urlPath) {
  const fullUrl = urlPath.startsWith("http") ? urlPath : `${AEM_BASE_URL}${urlPath.startsWith("/") ? urlPath : "/" + urlPath}`;
  const { data } = await client.get(urlPath);
  return data;
}

/** Collect every path in the tree that has cq:policy, and the value */
function collectCqPolicyPaths(obj, pathPrefix = "") {
  const out = [];
  const cqPolicy = obj["cq:policy"];
  if (typeof cqPolicy === "string") {
    out.push({ path: pathPrefix || "(root)", "cq:policy": cqPolicy });
  }
  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith("jcr:") || key.startsWith("cq:")) continue;
    if (val === null || typeof val !== "object" || Array.isArray(val)) continue;
    const sub = pathPrefix ? `${pathPrefix}/${key}` : key;
    out.push(...collectCqPolicyPaths(val, sub));
  }
  return out;
}

/** Same logic as resolver: find cq:policy whose value contains componentResourceType */
function findPolicyInObject(obj, componentResourceType) {
  const cqPolicy = obj["cq:policy"];
  if (typeof cqPolicy === "string" && cqPolicy.includes(componentResourceType))
    return cqPolicy;
  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith("jcr:") || key.startsWith("cq:")) continue;
    if (val === null || typeof val !== "object" || Array.isArray(val)) continue;
    const found = findPolicyInObject(val, componentResourceType);
    if (found) return found;
  }
  return undefined;
}

function getConfRootFromPageContent(pageContent, componentResourceType) {
  const cqConf = pageContent["cq:conf"];
  if (typeof cqConf === "string" && cqConf.startsWith("/conf/")) {
    const trimmed = cqConf.replace(/\/+$/, "");
    if (trimmed.length > 6) return { source: "cq:conf", value: trimmed };
  }
  const firstSegment = componentResourceType.split("/")[0];
  if (firstSegment) return { source: "componentType first segment", value: `/conf/${firstSegment}` };
  return null;
}

async function run() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("Policy resolution: path construction and lookups");
  console.log("═══════════════════════════════════════════════════════════════\n");
  console.log("Inputs:");
  console.log("  pagePath       ", pagePath);
  console.log("  componentType  ", componentType);
  console.log("  AEM_BASE_URL   ", AEM_BASE_URL);
  console.log("");

  // ─── Step 1: Page jcr:content ─────────────────────────────────────────────
  console.log("───────────────────────────────────────────────────────────────");
  console.log("Step 1: Page jcr:content (get cq:template, cq:conf)");
  console.log("───────────────────────────────────────────────────────────────");
  const path1 = `${pagePath}/jcr:content.infinity.json`;
  const url1 = `${AEM_BASE_URL}${path1}`;
  console.log("  Path requested (relative):", path1);
  console.log("  Full URL:                 ", url1);
  let pageContent;
  try {
    pageContent = await aemGet(path1);
  } catch (e) {
    console.log("  Result: FAIL -", e.message);
    if (e.response) console.log("  HTTP status:", e.response.status);
    return;
  }
  console.log("  Result: OK (object with", Object.keys(pageContent).length, "keys)");
  console.log("");
  console.log("  Lookup: reading from response:");
  const templatePath = pageContent["cq:template"];
  const cqConf = pageContent["cq:conf"];
  console.log("    cq:template  =>", templatePath !== undefined ? JSON.stringify(templatePath) : "(missing)");
  console.log("    cq:conf      =>", cqConf !== undefined ? JSON.stringify(cqConf) : "(missing)");
  if (!templatePath || typeof templatePath !== "string") {
    console.log("  FAIL: cq:template must be a non-empty string.");
    return;
  }
  console.log("  Used: templatePath =", templatePath);
  console.log("");

  // ─── Step 2: Template policies ────────────────────────────────────────────
  console.log("───────────────────────────────────────────────────────────────");
  console.log("Step 2: Template policies (find component policy mapping)");
  console.log("───────────────────────────────────────────────────────────────");
  const path2 = `${templatePath}/policies/jcr:content.infinity.json`;
  const url2 = `${AEM_BASE_URL}${path2}`;
  console.log("  Path construction:");
  console.log("    templatePath + '/policies/jcr:content.infinity.json'");
  console.log("  Path requested (relative):", path2);
  console.log("  Full URL:                 ", url2);
  let policiesContent;
  try {
    policiesContent = await aemGet(path2);
  } catch (e) {
    console.log("  Result: FAIL -", e.message);
    if (e.response) console.log("  HTTP status:", e.response.status);
    return;
  }
  console.log("  Result: OK (object with", Object.keys(policiesContent).length, "keys)");
  const contentKeys = Object.keys(policiesContent).filter((k) => !k.startsWith("jcr:") && !k.startsWith("cq:"));
  console.log("  Top-level content keys:", contentKeys.join(", ") || "(none)");
  console.log("");
  const allCqPolicies = collectCqPolicyPaths(policiesContent);
  console.log("  All cq:policy entries in this response (path => value):");
  if (allCqPolicies.length === 0) {
    console.log("    (none found)");
  } else {
    allCqPolicies.forEach(({ path: p, "cq:policy": v }) => console.log("    ", p, " => ", v));
  }
  /** Dump structure under a key (e.g. root) to see child keys and any cq:* on nodes */
  function dumpStructure(o, depth, maxDepth, prefix) {
    if (depth > maxDepth) return;
    const keys = Object.keys(o);
    const contentKeys = keys.filter((k) => !k.startsWith("jcr:") && !k.startsWith("cq:"));
    const metaKeys = keys.filter((k) => k.startsWith("jcr:") || k.startsWith("cq:"));
    if (metaKeys.length) console.log("    ", prefix, " [props]", metaKeys.join(", "));
    contentKeys.forEach((k) => {
      const v = o[k];
      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        console.log("    ", prefix, " ->", k);
        dumpStructure(v, depth + 1, maxDepth, prefix + "    ");
      }
    });
  }
  if (policiesContent.root && typeof policiesContent.root === "object") {
    console.log("  Structure under 'root' (first 4 levels, and any cq:/jcr: keys on nodes):");
    dumpStructure(policiesContent.root, 0, 4, "      ");
  }
  // Teaser node and its jcr:content (where cq:policy often lives in AEM)
  const teaserPath = ["root", "container", "wknd", "components", "teaser"];
  let node = policiesContent;
  for (const p of teaserPath) {
    node = node && typeof node === "object" && !Array.isArray(node) ? node[p] : undefined;
  }
  if (node && typeof node === "object") {
    console.log("  Node at root/container/wknd/components/teaser - all keys:", Object.keys(node).join(", "));
    const jcrContent = node["jcr:content"];
    if (jcrContent && typeof jcrContent === "object") {
      console.log("  jcr:content keys:", Object.keys(jcrContent).join(", "));
      if (typeof jcrContent["cq:policy"] !== "undefined") {
        console.log("  jcr:content[\"cq:policy\"] =>", jcrContent["cq:policy"]);
      }
    }
  }
  console.log("");
  console.log("  Lookup: find node whose cq:policy value CONTAINS:");
  console.log("    ", JSON.stringify(componentType));
  let cqPolicy = findPolicyInObject(policiesContent, componentType);
  if (!cqPolicy) {
    console.log("  Result: NOT FOUND (no cq:policy string in tree contains that value)");
    console.log("");
    console.log("  Fallback: path-based policy (template tree mirrors component path)");
    const pathBasedPolicy = "root/container/" + componentType;
    console.log("  Derived path: root/container + componentType =>", pathBasedPolicy);
    const confRootResultEarly = getConfRootFromPageContent(pageContent, componentType);
    if (confRootResultEarly) {
      const attempts = [
        { path: pathBasedPolicy, label: "root/container + componentType" },
        { path: componentType, label: "componentType" },
      ];
      for (const { path: rel, label } of attempts) {
        const fullPathAttempt = `${confRootResultEarly.value}/settings/wcm/policies/${rel}`;
        console.log("  GET (attempt):", fullPathAttempt + ".infinity.json", "(", label, ")");
        try {
          await aemGet(fullPathAttempt + ".infinity.json");
          console.log("  Result: path exists. Using:", rel);
          cqPolicy = rel;
          break;
        } catch (e) {
          console.log("  Result: path not found -", e.response?.status || e.message);
        }
      }
    }
    if (!cqPolicy) {
      console.log("");
      console.log("  Stopping here. Fix: ensure template has a policy mapping (cq:policy or path root/container/<componentType>).");
      return;
    }
  } else {
    console.log("  Result: FOUND (cq:policy)");
  }
  console.log("  Returned cq:policy (relative policy path):", cqPolicy);
  console.log("");

  // ─── Step 3: Conf root ────────────────────────────────────────────────────
  console.log("───────────────────────────────────────────────────────────────");
  console.log("Step 3: Derive /conf root");
  console.log("───────────────────────────────────────────────────────────────");
  console.log("  Priority: (1) cq:conf on page, (2) regionPath second segment, (3) componentType first segment");
  const confRootResult = getConfRootFromPageContent(pageContent, componentType);
  if (!confRootResult) {
    console.log("  Result: FAIL (no cq:conf, no regionPath, or empty componentType)");
    return;
  }
  console.log("  Source:", confRootResult.source);
  console.log("  confRoot:", confRootResult.value);
  const confRoot = confRootResult.value;
  console.log("");

  // ─── Step 4: Full policy path ─────────────────────────────────────────────
  console.log("───────────────────────────────────────────────────────────────");
  console.log("Step 4: Full policy path construction");
  console.log("───────────────────────────────────────────────────────────────");
  console.log("  Formula: confRoot + '/settings/wcm/policies/' + cqPolicy");
  console.log("    ", confRoot, "+ '/settings/wcm/policies/' +", cqPolicy);
  const fullPolicyPath = `${confRoot}/settings/wcm/policies/${cqPolicy}`;
  console.log("  Full policy path:", fullPolicyPath);
  const path5 = `${fullPolicyPath}.infinity.json`;
  const url5 = `${AEM_BASE_URL}${path5}`;
  console.log("  GET (to verify):", path5);
  console.log("  Full URL:       ", url5);
  try {
    const policyNode = await aemGet(path5);
    console.log("  Result: OK (policy node readable, keys:", Object.keys(policyNode).length + ")");
  } catch (e) {
    console.log("  Result: FAIL -", e.message);
    if (e.response) console.log("  HTTP status:", e.response.status);
  }
  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("Resolution result:", fullPolicyPath);
  console.log("═══════════════════════════════════════════════════════════════");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
