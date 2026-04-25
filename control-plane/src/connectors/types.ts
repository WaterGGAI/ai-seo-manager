export type PublishMode =
  | "kv_runtime"
  | "d1_override"
  | "api_feed_build_sync"
  | "workflow_module_source";

export type SiteType =
  | "brand_local_seo"
  | "programmatic_seo_tools"
  | "platform_with_embedded_seo"
  | "workflow_module_source";

export type ManagedSiteManifest = {
  id: string;
  label: string;
  sourceProjectPath: string;
  siteType: SiteType;
  primaryLanguage: string;
  publishMode: PublishMode;
  canonicalUrl: string;
  connectorName: string;
  migrationPriority: number;
  notes: string[];
};

export type SiteRegistryManifest = {
  mainlineSource: {
    projectPath: string;
    reason: string;
  };
  sites: ManagedSiteManifest[];
};

export type ConnectorCapability = {
  connectorName: string;
  publishMode: PublishMode;
  supportsDrafts: boolean;
  supportsRuntimePublish: boolean;
  supportsBuildSync: boolean;
  supportsStructuredOverrides: boolean;
  notes: string[];
};

