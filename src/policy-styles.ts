/**
 * Shared policy style parser and style name → cq:styleId lookup.
 *
 * Expected JSON shape (see docs/POLICY-STRUCTURE-AUDIT.md):
 *   policy["cq:styleGroups"] = { "<groupKey>": { "cq:styles": { "<nodeName>": { "cq:styleId", "cq:styleLabel", "cq:styleClasses" } } } }
 * Style nodes are under cq:styleGroups[groupKey].cq:styles; keys jcr:/cq: are skipped when discovering nodes.
 */

export interface PolicyStyleEntry {
  styleId: string;
  styleLabel: string;
  styleClasses?: string;
}

export interface PolicyStyleEntryWithNodeName extends PolicyStyleEntry {
  nodeName: string;
}

export interface PolicyStyleGroupResult {
  groupId: string;
  groupTitle: string;
  styles: PolicyStyleEntryWithNodeName[];
}

export interface PolicyStylesResult {
  /** Flat list of all styles across groups. */
  styles: PolicyStyleEntry[];
  /** Case-insensitive lookup: lowercase styleLabel → cq:styleId. First match wins for duplicate labels. */
  labelToId: Record<string, string>;
  /** Styles grouped as in the policy (for list_component_styles output). */
  groups: PolicyStyleGroupResult[];
}

type PolicyStyle = Record<string, unknown>;
type PolicyStyleGroup = {
  "cq:title"?: string;
  "cq:styleGroupLabel"?: string;
  "cq:styles"?: Record<string, PolicyStyle>;
};
type PolicyJson = { "cq:styleGroups"?: Record<string, PolicyStyleGroup>; [key: string]: unknown };

/**
 * Parses policy JSON and returns a flat list of styles, a label→styleId map
 * (case-insensitive), and groups for display.
 * See docs/POLICY-STRUCTURE-AUDIT.md for the expected structure.
 */
export function parsePolicyStyles(policyJson: PolicyJson): PolicyStylesResult {
  const styles: PolicyStyleEntry[] = [];
  const labelToId: Record<string, string> = {};
  const groups: PolicyStyleGroupResult[] = [];
  const styleGroupsRaw = policyJson["cq:styleGroups"] ?? {};

  for (const [groupId, val] of Object.entries(styleGroupsRaw)) {
    if (groupId.startsWith("jcr:") || groupId.startsWith("cq:")) continue;
    if (val === null || typeof val !== "object" || Array.isArray(val)) continue;
    const group = val as PolicyStyleGroup;
    const groupTitle =
      (group["cq:styleGroupLabel"] as string) ?? (group["cq:title"] as string) ?? "";
    const stylesRaw = group["cq:styles"] ?? {};
    const groupStyles: PolicyStyleEntryWithNodeName[] = [];

    for (const [nodeName, styleVal] of Object.entries(stylesRaw)) {
      if (nodeName.startsWith("jcr:") || nodeName.startsWith("cq:")) continue;
      if (styleVal === null || typeof styleVal !== "object" || Array.isArray(styleVal)) continue;
      const style = styleVal as PolicyStyle;
      const styleId = (style["cq:styleId"] as string) ?? "";
      const styleLabel = (style["cq:styleLabel"] as string) ?? "";
      const styleClasses = (style["cq:styleClasses"] as string) ?? "";

      const entry: PolicyStyleEntryWithNodeName = {
        nodeName,
        styleId,
        styleLabel,
        styleClasses,
      };
      groupStyles.push(entry);
      styles.push({ styleId, styleLabel, styleClasses });

      const key = styleLabel.toLowerCase();
      if (key && !(key in labelToId)) {
        labelToId[key] = styleId;
      }
    }

    groups.push({ groupId, groupTitle, styles: groupStyles });
  }

  return { styles, labelToId, groups };
}

/**
 * Returns the node that contains cq:styleGroups. AEM often nests it under a child (e.g. policy_123).
 */
function getStyleGroupsRoot(obj: PolicyJson): PolicyJson {
  if (obj["cq:styleGroups"] != null) return obj;
  for (const val of Object.values(obj)) {
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      const key = (val as Record<string, unknown>)["cq:styleGroups"];
      if (key != null) return val as PolicyJson;
    }
  }
  return obj;
}

/**
 * Fetches policy from AEM and parses styles. Use this when you have a policy path.
 * @param policyPath - JCR path to the policy node (without .infinity.json).
 * @param aemGetFn - GET function, e.g. aemGet from aem-client.
 */
export async function getPolicyStyles(
  policyPath: string,
  aemGetFn: <T>(path: string) => Promise<T>
): Promise<PolicyStylesResult> {
  const policy = await aemGetFn<PolicyJson>(`${policyPath}.infinity.json`);
  const root = getStyleGroupsRoot(policy);
  return parsePolicyStyles(root);
}

export type ResolveStyleResult = { styleId: string } | { error: string };

/**
 * Resolve a style input (name or cq:styleId) to cq:styleId using the policy.
 * Lookup order: try label first (case-insensitive); if no match, treat input as direct cq:styleId.
 * Returns error if the input is neither a matching label nor a valid style ID in the policy.
 */
export async function resolveStyleToId(
  policyPath: string,
  styleInput: string,
  aemGetFn: <T>(path: string) => Promise<T>
): Promise<ResolveStyleResult> {
  const policyResult = await getPolicyStyles(policyPath, aemGetFn);
  const byLabel = policyResult.labelToId[styleInput.toLowerCase()];
  if (byLabel) return { styleId: byLabel };
  const validIds = new Set(policyResult.styles.map((s) => s.styleId));
  if (validIds.has(styleInput)) return { styleId: styleInput };
  return {
    error: `Style "${styleInput}" not found as a label in the policy and is not a valid style ID in the policy.`,
  };
}
