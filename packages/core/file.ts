// File-level manifest — governance metadata between L2 and L1

import type { GovernanceConfidence, SourceEvidence } from "./evidence.js";
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
  readonly evidence?: readonly SourceEvidence[];
  readonly confidence?: GovernanceConfidence;
  readonly assumptions?: readonly string[];
  readonly needsHumanReview?: boolean;
  readonly revision: ArtifactVersion;
  readonly contentHash: string;
}
