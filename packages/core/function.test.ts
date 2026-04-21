import { describe, expect, it } from "vitest";
import type { FunctionManifest } from "./function.js";
import type { ArtifactVersion } from "./version.js";

const REV: ArtifactVersion = {
  rev: 1,
  parentRev: null,
  source: { type: "init" },
  timestamp: "2024-01-01T00:00:00.000Z",
};

describe("FunctionManifest", () => {
  it("captures function-level contract and plugin metadata as a persisted artifact", () => {
    const manifest: FunctionManifest = {
      id: "packages-core-store-read-file-manifest",
      fileRef: "packages-core-store-ts",
      exportName: "readFileManifest",
      signature: "readFileManifest(root: string, id: string): Promise<FileManifest | null>",
      preconditions: ["root points to a project directory", "id is a stable manifest id"],
      postconditions: ["returns null when the manifest is missing"],
      pluginPolicy: ["contract-check", "trace"],
      revision: REV,
      contentHash: "function-manifest-hash",
    };

    expect(manifest.exportName).toBe("readFileManifest");
    expect(manifest.fileRef).toBe("packages-core-store-ts");
    expect(manifest.pluginPolicy).toContain("trace");
    expect(manifest.revision).toEqual(REV);
    expect(manifest.contentHash).toBe("function-manifest-hash");
  });
});
