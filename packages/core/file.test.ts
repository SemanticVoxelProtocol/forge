import { describe, expect, it } from "vitest";
import type { FileManifest } from "./file.js";
import type { ArtifactVersion } from "./version.js";

const REV: ArtifactVersion = {
  rev: 1,
  parentRev: null,
  source: { type: "init" },
  timestamp: "2024-01-01T00:00:00.000Z",
};

describe("FileManifest", () => {
  it("captures file-level governance metadata as a persisted artifact", () => {
    const manifest: FileManifest = {
      id: "packages-core-store-ts",
      path: "packages/core/store.ts",
      purpose: "Persist SVP artifacts and manifests",
      l2BlockRef: "store-layer",
      blockRefs: ["store-layer", "changeset-layer"],
      exports: ["readL3", "writeL3", "readFileManifest"],
      ownership: ["packages/core"],
      dependencyBoundary: ["packages/core/*", "node:*"],
      pluginGroups: ["governance", "observability"],
      revision: REV,
      contentHash: "file-manifest-hash",
    };

    expect(manifest.path).toBe("packages/core/store.ts");
    expect(manifest.exports).toContain("readFileManifest");
    expect(manifest.dependencyBoundary).toContain("node:*");
    expect(manifest.revision).toEqual(REV);
    expect(manifest.contentHash).toBe("file-manifest-hash");
  });
});
