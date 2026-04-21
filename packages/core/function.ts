// Function-level manifest — contract and plugin metadata for key functions

import type { ArtifactVersion } from "./version.js";

export interface FunctionManifest {
  readonly id: string;
  readonly fileRef: string;
  readonly exportName: string;
  readonly signature: string;
  readonly preconditions: readonly string[];
  readonly postconditions: readonly string[];
  readonly pluginPolicy: readonly string[];
  readonly revision: ArtifactVersion;
  readonly contentHash: string;
}
