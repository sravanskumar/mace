/**
 * Tests for template → policy resolution (mocked Sling responses).
 * Run with: npx ts-node src/template-policy-resolver.test.ts
 */

import { strict as assert } from "node:assert";
import {
  getPolicyPathForPageComponent,
  getTenantFromTemplatePath,
} from "./template-policy-resolver.js";

type AemGetFn = <T>(path: string) => Promise<T>;

function createMockAemGet(responses: Map<string, unknown>): AemGetFn {
  return async (path: string) => {
    const data = responses.get(path);
    if (data === undefined) throw new Error(`No mock for path: ${path}`);
    return data as never;
  };
}

async function runTests() {
  const templatePath = "/conf/wknd/settings/wcm/templates/content-page-template";
  const pagePath = "/content/wknd/language-masters/en/homepage";

  const pageContent = {
    "cq:template": templatePath,
    "jcr:primaryType": "cq:PageContent",
  };

  const policiesContent = {
    "jcr:primaryType": "nt:unstructured",
    root: {
      container: {
        wknd: {
          components: {
            teaser: {
              "cq:policy": "wknd/components/teaser/policy_1555539430196",
              "jcr:primaryType": "nt:unstructured",
              "sling:resourceType": "wcm/core/components/policies/mapping",
            },
          },
        },
      },
    },
  };

  const responses = new Map<string, unknown>();
  responses.set(`${pagePath}/jcr:content.infinity.json`, pageContent);
  responses.set(`${templatePath}/policies/jcr:content.infinity.json`, policiesContent);
  const mockGet = createMockAemGet(responses);

  // Resolve with mapping path (WKND-style); component type is fully qualified sling:resourceType
  const componentResourceType = "wknd/components/teaser";
  const withMapping = await getPolicyPathForPageComponent(
    pagePath,
    componentResourceType,
    mockGet,
    { mappingPathRelative: "root/container/wknd/components/teaser" }
  );
  assert.equal(
    withMapping,
    "/conf/wknd/settings/wcm/policies/wknd/components/teaser/policy_1555539430196",
    "should return full policy path when mapping path is provided"
  );

  // Resolve by component type (search for cq:policy containing component resource type)
  const bySearch = await getPolicyPathForPageComponent(
    pagePath,
    componentResourceType,
    mockGet
  );
  assert.equal(
    bySearch,
    "/conf/wknd/settings/wcm/policies/wknd/components/teaser/policy_1555539430196",
    "should find cq:policy in tree and return full path"
  );

  // Fallback when template policies tree has no cq:policy (path = component type)
  const policiesNoCqPolicy = {
    "jcr:primaryType": "nt:unstructured",
    root: {
      container: {
        wknd: {
          components: {
            teaser: {
              "jcr:primaryType": "nt:unstructured",
              "jcr:content": {},
            },
          },
        },
      },
    },
  };
  const responsesFallback = new Map<string, unknown>();
  responsesFallback.set(`${pagePath}/jcr:content.infinity.json`, pageContent);
  responsesFallback.set(`${templatePath}/policies/jcr:content.infinity.json`, policiesNoCqPolicy);
  const mockGetFallback = createMockAemGet(responsesFallback);
  const fallback = await getPolicyPathForPageComponent(
    pagePath,
    componentResourceType,
    mockGetFallback
  );
  assert.equal(
    fallback,
    "/conf/wknd/settings/wcm/policies/wknd/components/teaser",
    "when no cq:policy in tree, should use componentResourceType as relative policy path"
  );

  // Tenant derivation
  assert.equal(getTenantFromTemplatePath(templatePath), "wknd");
  assert.equal(getTenantFromTemplatePath("/conf/tenant1/settings/wcm/templates/x"), "tenant1");
  assert.equal(getTenantFromTemplatePath("/content/foo"), null);
  assert.equal(getTenantFromTemplatePath(""), null);

  // Missing cq:template → null
  const noTemplateResponses = new Map<string, unknown>();
  noTemplateResponses.set(`${pagePath}/jcr:content.infinity.json`, { "jcr:primaryType": "cq:PageContent" });
  const noTemplateGet = createMockAemGet(noTemplateResponses);
  const noTemplate = await getPolicyPathForPageComponent(
    pagePath,
    componentResourceType,
    noTemplateGet,
    { mappingPathRelative: "root/container/wknd/components/teaser" }
  );
  assert.equal(noTemplate, null, "should return null when cq:template is missing");

  // GET throws → null
  const failingGet: AemGetFn = async () => {
    throw new Error("Network error");
  };
  const onError = await getPolicyPathForPageComponent(
    pagePath,
    componentResourceType,
    failingGet,
    { mappingPathRelative: "root/container/wknd/components/teaser" }
  );
  assert.equal(onError, null, "should return null when GET fails");

  // Wrong mapping path → null
  const wrongPathResponses = new Map<string, unknown>();
  wrongPathResponses.set(`${pagePath}/jcr:content.infinity.json`, pageContent);
  wrongPathResponses.set(`${templatePath}/policies/jcr:content.infinity.json`, policiesContent);
  const wrongPathGet = createMockAemGet(wrongPathResponses);
  const wrongPath = await getPolicyPathForPageComponent(
    pagePath,
    componentResourceType,
    wrongPathGet,
    { mappingPathRelative: "root/nonexistent/teaser" }
  );
  assert.equal(wrongPath, null, "should return null when mapping path does not exist");

  // Priority 2: cq:conf from page jcr:content takes precedence
  const pageContentWithCqConf = {
    "cq:template": templatePath,
    "cq:conf": "/conf/wknd",
    "jcr:primaryType": "cq:PageContent",
  };
  const responsesP2 = new Map<string, unknown>();
  responsesP2.set(`${pagePath}/jcr:content.infinity.json`, pageContentWithCqConf);
  responsesP2.set(`${templatePath}/policies/jcr:content.infinity.json`, policiesContent);
  const mockGetP2 = createMockAemGet(responsesP2);
  const withCqConf = await getPolicyPathForPageComponent(
    pagePath,
    componentResourceType,
    mockGetP2,
    { mappingPathRelative: "root/container/wknd/components/teaser" }
  );
  assert.equal(
    withCqConf,
    "/conf/wknd/settings/wcm/policies/wknd/components/teaser/policy_1555539430196",
    "should use cq:conf from page when present (Priority 2)"
  );

  // Priority 3: regionPath second segment when cq:conf is absent
  const responsesP3 = new Map<string, unknown>();
  responsesP3.set(`${pagePath}/jcr:content.infinity.json`, pageContent);
  responsesP3.set(`${templatePath}/policies/jcr:content.infinity.json`, policiesContent);
  const mockGetP3 = createMockAemGet(responsesP3);
  const withRegionPath = await getPolicyPathForPageComponent(
    pagePath,
    componentResourceType,
    mockGetP3,
    { mappingPathRelative: "root/container/wknd/components/teaser", regionPath: "/content/wknd/language-masters/de" }
  );
  assert.equal(
    withRegionPath,
    "/conf/wknd/settings/wcm/policies/wknd/components/teaser/policy_1555539430196",
    "should use region path second segment when cq:conf absent (Priority 3)"
  );

  console.log("All template-policy-resolver tests passed.");
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
