import { connectorDefinitions, getConnectorDefinition } from "./contract";
import siteRegistryManifest from "../../config/sites.json";
import type {
  ConnectorCapability,
  ManagedSiteManifest,
  PublishMode,
  SiteRegistryManifest
} from "./types";

const manifest = siteRegistryManifest as SiteRegistryManifest;

function buildConnectorCapabilities(publishMode: PublishMode, connectorName: string): ConnectorCapability {
  if (publishMode === "kv_runtime") {
    return {
      connectorName,
      publishMode,
      supportsDrafts: true,
      supportsRuntimePublish: true,
      supportsBuildSync: false,
      supportsStructuredOverrides: false,
      notes: ["Designed for runtime blog/article publishing backed by Worker state."]
    };
  }

  if (publishMode === "d1_override") {
    return {
      connectorName,
      publishMode,
      supportsDrafts: true,
      supportsRuntimePublish: false,
      supportsBuildSync: false,
      supportsStructuredOverrides: true,
      notes: ["Designed for structured page overrides such as calculator metadata and body blocks."]
    };
  }

  if (publishMode === "api_feed_build_sync") {
    return {
      connectorName,
      publishMode,
      supportsDrafts: true,
      supportsRuntimePublish: false,
      supportsBuildSync: true,
      supportsStructuredOverrides: false,
      notes: ["Designed for publishing a feed that downstream sites sync during build or deploy."]
    };
  }

  return {
    connectorName,
    publishMode,
    supportsDrafts: false,
    supportsRuntimePublish: false,
    supportsBuildSync: false,
    supportsStructuredOverrides: false,
    notes: ["Workflow-module source only. Not intended as an initial managed-site runtime connector."]
  };
}

export function getMainlineSource() {
  return manifest.mainlineSource;
}

export function attachConnectorCapabilities(site: ManagedSiteManifest): ManagedSiteManifest & { capabilities: ConnectorCapability } {
  return {
    ...site,
    capabilities: buildConnectorCapabilities(site.publishMode, site.connectorName)
  };
}

export function listManagedSiteManifests() {
  return manifest.sites.slice().sort((left, right) => left.migrationPriority - right.migrationPriority);
}

export function getManagedSiteManifest(siteId: string) {
  return listManagedSiteManifests().find((site) => site.id === siteId) ?? null;
}

export function listManagedSites(): Array<ManagedSiteManifest & { capabilities: ConnectorCapability }> {
  return listManagedSiteManifests().map(attachConnectorCapabilities);
}

export function getManagedSite(siteId: string) {
  const site = getManagedSiteManifest(siteId);
  return site ? attachConnectorCapabilities(site) : null;
}

export function listSupportedPublishModes() {
  return Array.from(new Set(manifest.sites.map((site) => site.publishMode))).sort();
}

export function listConnectorDefinitions() {
  return connectorDefinitions;
}

export { getConnectorDefinition };
