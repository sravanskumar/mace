/**
 * Template → policy resolution (Sling GET only, no custom AEM code).
 *
 * Resolves the Content Policy path for a component on a page by:
 * 1. Reading the page's template (e.g. cq:template on jcr:content)
 * 2. Reading the template's policies subtree
 * 3. Finding the component policy mapping (by relative path or by searching for cq:policy)
 * 4. Building the full policy path: <confRoot>/settings/wcm/policies/<cq:policy>
 *
 * The /conf root is derived by a priority chain (no extra network calls):
 * - Priority 2: cq:conf from the page's jcr:content (already fetched)
 * - Priority 3: second segment of the governance rule's region path (/content/<tenant>/...)
 * - Priority 4: first segment of componentType (e.g. wknd from wknd/components/teaser)
 * - Priority 5: null and skip (Priority 1 = explicit policyPath in rule is handled by the caller).
 */

type AemGetFn = <T>(path: string) => Promise<T>;

export interface GetPolicyPathOptions {
  /**
   * Path under template policies jcr:content to the component mapping node (e.g. "root/container/wknd/components/teaser").
   * If not set, the resolver searches for a node whose cq:policy value contains componentResourceType.
   */
  mappingPathRelative?: string;
  /**
   * Region path from the governance rule (e.g. /content/wknd/language-masters/de).
   * Used to derive /conf root from the second path segment when cq:conf is not present.
   */
  regionPath?: string;
}

/**
 * Returns the full policy path for the given component on the page, or null if any step fails.
 * Uses only Sling GET. Handles missing/unexpected JSON by returning null (no throw).
 */
export async function getPolicyPathForPageComponent(
  pagePath: string,
  componentResourceType: string,
  aemGetFn: AemGetFn,
  options?: GetPolicyPathOptions
): Promise<string | null> {
  try {
    const pageContent = await aemGetFn<Record<string, unknown>>(
      `${pagePath}/jcr:content.infinity.json`
    );
    if (!pageContent || typeof pageContent !== "object") return null;

    const templatePath = pageContent["cq:template"] as string | undefined;
    if (!templatePath || typeof templatePath !== "string") return null;

    const policiesContent = await aemGetFn<Record<string, unknown>>(
      `${templatePath}/policies/jcr:content.infinity.json`
    );
    if (!policiesContent || typeof policiesContent !== "object") return null;

    let cqPolicy: string | undefined;
    if (options?.mappingPathRelative) {
      cqPolicy = getPolicyByPath(policiesContent, options.mappingPathRelative);
    } else {
      cqPolicy = findPolicyByComponentType(policiesContent, componentResourceType);
      // Fallback: many AEM setups store policy at /conf/.../policies/<componentResourceType>
      // (template policies tree has no cq:policy property; path mirrors component type)
      if (!cqPolicy) cqPolicy = componentResourceType;
    }
    if (!cqPolicy) return null;

    const confRoot = getConfRoot(
      pageContent,
      options?.regionPath,
      componentResourceType
    );
    if (!confRoot) return null;

    return `${confRoot}/settings/wcm/policies/${cqPolicy}`;
  } catch {
    return null;
  }
}

/**
 * Derive /conf root using a priority chain (no extra network calls).
 * Priority 2: cq:conf from page jcr:content (AEM-authoritative).
 * Priority 3: second segment of region path (/content/<tenant>/...).
 * Priority 4: first segment of componentResourceType (e.g. wknd/components/teaser → wknd).
 * Priority 5: null and log.
 */
function getConfRoot(
  pageContent: Record<string, unknown>,
  regionPath: string | undefined,
  componentResourceType: string
): string | null {
  // Priority 2: cq:conf from the page's jcr:content (already in memory)
  const cqConf = pageContent["cq:conf"];
  if (typeof cqConf === "string" && cqConf.startsWith("/conf/")) {
    const trimmed = cqConf.replace(/\/+$/, "");
    if (trimmed.length > 6) return trimmed;
  }

  // Priority 3: second segment of the governance rule's region path
  if (regionPath && typeof regionPath === "string") {
    const segments = regionPath.split("/").filter(Boolean);
    if (segments[0] === "content" && segments[1]) {
      return `/conf/${segments[1]}`;
    }
  }

  // Priority 4: first segment of componentType (e.g. wknd from wknd/components/teaser)
  const firstSegment = componentResourceType.split("/")[0];
  if (firstSegment) {
    return `/conf/${firstSegment}`;
  }

  // Priority 5: no usable /conf root
  console.warn(
    "[MACE] Could not derive /conf root: no cq:conf on page, no regionPath with content/<tenant>, and no first segment in componentType."
  );
  return null;
}

/**
 * Derive tenant from template path: first segment under /conf/.
 * @deprecated Prefer getConfRoot / policy path resolution with regionPath or cq:conf.
 */
export function getTenantFromTemplatePath(templatePath: string): string | null {
  const match = /^\/conf\/([^/]+)\//.exec(templatePath);
  return match ? match[1] : null;
}

/**
 * Traverse policies JSON by path (e.g. "root/container/wknd/components/teaser") and return cq:policy.
 */
function getPolicyByPath(
  obj: Record<string, unknown>,
  relativePath: string
): string | undefined {
  const parts = relativePath.split("/").filter(Boolean);
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || typeof current !== "object" || Array.isArray(current))
      return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  if (current === null || typeof current !== "object" || Array.isArray(current))
    return undefined;
  const policy = (current as Record<string, unknown>)["cq:policy"];
  return typeof policy === "string" ? policy : undefined;
}

/**
 * Recursively find a node with cq:policy whose value contains componentResourceType (e.g. "teaser").
 * Skips jcr: and cq: keys when traversing to avoid metadata nodes.
 */
function findPolicyByComponentType(
  obj: Record<string, unknown>,
  componentResourceType: string
): string | undefined {
  const cqPolicy = obj["cq:policy"];
  if (typeof cqPolicy === "string" && cqPolicy.includes(componentResourceType))
    return cqPolicy;

  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith("jcr:") || key.startsWith("cq:")) continue;
    if (val === null || typeof val !== "object" || Array.isArray(val)) continue;
    const found = findPolicyByComponentType(
      val as Record<string, unknown>,
      componentResourceType
    );
    if (found) return found;
  }
  return undefined;
}
