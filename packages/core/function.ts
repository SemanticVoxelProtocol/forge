// Function-level manifest — contract and plugin metadata for key functions

import type { GovernanceConfidence, SourceEvidence } from "./evidence.js";
import type { ArtifactVersion } from "./version.js";

export interface FunctionManifest {
  readonly id: string;
  readonly fileRef: string;
  readonly exportName: string;
  readonly signature: string;
  readonly observedSignature?: string;
  readonly contractSignature?: string;
  readonly preconditions: readonly string[];
  readonly postconditions: readonly string[];
  readonly pluginPolicy: readonly string[];
  readonly evidence?: readonly SourceEvidence[];
  readonly confidence?: GovernanceConfidence;
  readonly assumptions?: readonly string[];
  readonly needsHumanReview?: boolean;
  readonly revision: ArtifactVersion;
  readonly contentHash: string;
}
