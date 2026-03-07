# Prompts and Acceptance Criteria

**Audience:** Developers. **Use during build** to verify that Claude (with MACE tools) behaves correctly. Each section has prompt text to use in Claude and acceptance criteria that define “done.”

**Assumptions:** Local AEM at **http://localhost:4502** with **WKND** sample content; credentials **admin / admin** unless overridden. Expected output matches this setup.

**Automated check:** With AEM running and `.env` set, run `npm run acceptance` to verify tool response shape (list_pages, list_component_styles, list_style_violations) against these criteria. This does not run prompts in Claude; it calls the tool handlers directly.

---

## 1. List styles by page and component (primary UX)

**Prompt**

```
List the available styles for wknd/components/teaser on page /content/wknd/language-masters/en
```

**Acceptance criteria**

- Claude calls **list_component_styles** with `pagePath` and `componentType` (no policy path).
- Response includes `resolvedPolicyPath` and `styleGroups` (or equivalent style list).
- Claude reports which styles exist (e.g. Featured, List, Card — per policy) and that these names are used in rules and when fixing violations.
- If resolution fails, the tool returns a clear error; Claude surfaces it and does not invent a policy path.

---

## 2. List allowed styles for a component in a region

**Prompt**

```
What styles are allowed for wknd/components/teaser under /content/wknd/language-masters/de?
```

**Acceptance criteria**

- Claude uses **list_style_violations** with that region and reads **allowedStyleNames** from the response.
- Answer states the allowed style names for that region/component (e.g. DE teaser: only "Featured").

---

## 3. Violations and allowed styles (one region)

**Prompt**

```
Find style violations under /content/wknd/language-masters/en and tell me what’s allowed for teasers there.
```

**Acceptance criteria**

- Claude runs **list_style_violations** with **regionPath** (not pagePath) and reports violations and **allowedStyleNames** for the region (e.g. EN: only "Featured" per current rules).
- Response includes **allowedStyleNames** from the governance rule; no mixing with other regions or components.

---

## 3b. Violations: page vs region (scope)

**list_style_violations** supports two scopes and optional component filter:

- **pagePath** — Scan only that page (no descendant pages). Use when the user says *"on page X"*, *"for page X"*, or *"check violations on /content/.../en"* (a specific page).
- **regionPath** — Scan **the region page itself** and all descendant pages. Use when the user says *"under region X"*, *"in region X"*, or *"check violations under /content/.../en"*. The reported page count and violations always include the region path (e.g. `/content/wknd/language-masters/en`) as well as its children.
- **componentType** — Optional. If omitted, scan **all** component types in the rule. If provided, **must be the fully qualified resource type** (e.g. `wknd/components/teaser`) so the intent is unambiguous when multiple components could match.

**Prompt (single page)**

```
Check for violations on page /content/wknd/language-masters/en
```

**Acceptance criteria**

- Claude calls **list_style_violations** with **pagePath: "/content/wknd/language-masters/en"** (no regionPath).
- Response has **scope: "page"** and **totalPages: 1**; violations reported are only from that page.

**Prompt (region and children)**

```
Check for violations under region /content/wknd/language-masters/en
```

**Acceptance criteria**

- Claude calls **list_style_violations** with **regionPath: "/content/wknd/language-masters/en"** (no pagePath).
- Response has **scope: "region"** and **totalPages** = region page + all descendants (e.g. 33 for EN: the page `/content/wknd/language-masters/en` plus 32 child pages). Violations may be on the region page or on any descendant (e.g. .../en/magazine).

---

## 3c. Component: use fully qualified type

To avoid ambiguity when multiple components could match, **users should specify the fully qualified component resource type** (e.g. `wknd/components/teaser`), not a short name like "teaser". The tool expects and documents this format.

**Preferred prompt when scanning a specific component**

```
List wknd/components/teaser violations under region /content/wknd/language-masters/en
```

**Acceptance criteria**

- Claude calls **list_style_violations** with **regionPath: "/content/wknd/language-masters/en"** and **componentType: "wknd/components/teaser"** (fully qualified).
- If the user says only "teaser", Claude should treat it as the fully qualified type used in the rule (e.g. wknd/components/teaser) or ask for the full type when ambiguous.

---

## 3d. List all violations (no component specified)

When the user does **not** mention a component (e.g. *"list all violations under region X"* or *"check for violations on page Y"*), call **list_style_violations** **without** `componentType`. The tool then scans every governed component type in the rule for that path and returns violations; each violation includes **componentType** (e.g. `wknd/components/teaser`). Response includes **componentTypesScanned**.

**Prompt**

```
List all violations under region /content/wknd/language-masters/en
```

**Acceptance criteria**

- Claude calls **list_style_violations** with **regionPath** and **no componentType**.
- Response has **componentTypesScanned** (array of component types in the rule) and each violation has **componentType**. Same result as scanning each component type separately, combined.

**Prompt (single page, no component)**

```
Check for violations on page /content/wknd/language-masters/en
```

**Acceptance criteria**

- Claude calls **list_style_violations** with **pagePath** and **no componentType**.
- Response has **scope: "page"**, **totalPages: 1**, and violations only from that page; each violation has **componentType**.

---

## 3e. Presenting violations as a table (three columns)

To get a violations table with **Component path**, **Applied styles (violation)**, and **Allowed style names**, ask for the table and specify the columns. Each violation in the tool response includes **appliedStyleLabels** (current styles on the component) and **allowedStyleNames** (allowed by governance rules).

**Prompt**

```
List violations under region /content/wknd/language-masters/en as table. When showing the violations table, use three columns: Component path, Applied styles (violation), Allowed style names (from allowedStyleNames).
```

**Acceptance criteria**

- Claude calls **list_style_violations** (with **regionPath**; **componentType** optional).
- Claude presents the violations in a table with three columns: **Component path**, **Applied styles (violation)** (from `appliedStyleLabels`), **Allowed style names** (from `allowedStyleNames`).

---

## 4. Full governance cycle (scan → fix → re-scan)

**Prompt**

```
Find all wknd/components/teaser style violations under /content/wknd/language-masters/de. If there are any, fix them using the style named Featured. Then scan the same region again and confirm there are no violations.
```

**Acceptance criteria**

- First: **list_style_violations** with **componentType: "wknd/components/teaser"** (or omit for all components); Claude summarizes `totalViolations` and violation details.
- If violations exist: **fix_style_violations** with the violation list (including `policyPath` when available) and `styleId: "Featured"`; response shows fixed count.
- Final: **list_style_violations** again; Claude reports `totalViolations === 0` or explains any remaining failure.

**Simpler fix prompts (same outcome):** Once violations are in context from a scan, you can say *"Fix all the violations"* (add *"using Featured"* to specify the style). To fix by region without a prior scan, use the fully qualified component type, e.g. *"Fix the violations for wknd/components/teaser on /content/wknd/language-masters/de"* — the assistant runs the scan for that region and component, then calls the fix tool with the returned list and an allowed style.

---

## 5. List styles with policy path override

**Prompt**

```
List the styles in the policy at /conf/wknd/settings/wcm/policies/wknd/components/teaser/policy_1555539430196
```

**Acceptance criteria**

- Claude calls **list_component_styles** with `policyPath` only (no pagePath/componentType).
- Response includes `resolvedPolicyPath` and `styleGroups` with labels and IDs.
- Claude summarizes the list and notes this is the full policy; “allowed” is per region from the violation tool or rules.

---

## 6. Unknown region / no rule

**Prompt**

```
Find wknd/components/teaser violations under /content/wknd/nonexistent/site
```

**Acceptance criteria**

- Tool returns an error: no governance rule found for that region and component type.
- Claude relays that message and does not report violations or invent a rule.

---

## 7. Tool registration

**Prompt**

```
What governance tools do you have available?
```

**Acceptance criteria**

- Claude lists all five MACE tools with their descriptions (list_pages, list_style_violations, list_component_styles, update_component_style, fix_style_violations).

---

## 8. Invalid style vs region violation

**Prompt** (after setting a teaser under DE to a disallowed style in AEM, e.g. "List")

```
Find wknd/components/teaser style violations under /content/wknd/language-masters/de
```

**Acceptance criteria**

- If the rule’s **allowedStyleNames** all exist in the policy: at least one violation with **violationType: "REGION_VIOLATION"** (styles applied that are not allowed by governance rules); payload includes **policyPath**, **allowedStyleNames** (allowed by governance), **appliedStyleLabels** (current styles on the component), **appliedStyles** (IDs), **page**, **componentPath**. Compare applied vs allowed to see what is not allowed.
- If the rule references a style name not in the policy: **violationType: "POLICY_MISCONFIGURATION"** with **styleNamesNotFoundInPolicy**; no REGION_VIOLATION for that page.
