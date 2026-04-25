import { demoCalculatorD1BootstrapSeed } from "./demo-calculator-d1";
import { demoBrandRuntimeBootstrapSeed } from "./demo-brand-runtime";
import { demoRuntimePlatformBootstrapSeed } from "./demo-runtime-platform";
import { demoLocalRuntimeBootstrapSeed } from "./demo-local-runtime";
import { demoPlatformBuildSyncBootstrapSeed } from "./demo-platform-build-sync";
import type { ManagedSiteBootstrapSeed } from "./types";

const siteBootstrapSeeds: Record<string, ManagedSiteBootstrapSeed> = {
  [demoCalculatorD1BootstrapSeed.siteId]: demoCalculatorD1BootstrapSeed,
  [demoBrandRuntimeBootstrapSeed.siteId]: demoBrandRuntimeBootstrapSeed,
  [demoRuntimePlatformBootstrapSeed.siteId]: demoRuntimePlatformBootstrapSeed,
  [demoLocalRuntimeBootstrapSeed.siteId]: demoLocalRuntimeBootstrapSeed,
  [demoPlatformBuildSyncBootstrapSeed.siteId]: demoPlatformBuildSyncBootstrapSeed
};

export function getSiteBootstrapSeed(siteId: string) {
  return siteBootstrapSeeds[siteId] ?? null;
}

export function hasSiteBootstrapSeed(siteId: string) {
  return Boolean(getSiteBootstrapSeed(siteId));
}
