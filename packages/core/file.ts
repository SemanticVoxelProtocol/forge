// File-level manifest — governance metadata between L2 and L1

import type { ArtifactVersion } from "./version.js";

export interface FileManifest {
  readonly id: string;
  readonly path: string;
  readonly purpose: string;
  readonly l2BlockRef: string;
  readonly blockRefs: readonly string[];
  readonly exports: readonly string[];
  readonly ownership: readonly string[];
  readonly dependencyBoundary: readonly string[];
  readonly pluginGroups: readonly string[];
  readonly revision: ArtifactVersion;
  readonly contentHash: string;
}
