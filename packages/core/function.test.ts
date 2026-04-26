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
      observedSignature: "readFileManifest(root: string, id: string): Promise<FileManifest | null>",
      contractSignature: "readFileManifest(root, id) -> FileManifest | null",
      preconditions: ["root points to a project directory", "id is a stable manifest id"],
      postconditions: ["returns null when the manifest is missing"],
      pluginPolicy: ["contract-check", "trace"],
      evidence: [
        {
          path: "packages/core/store.ts",
          kind: "source-excerpt",
          excerpt: "export async function readFileManifest",
          excerptHash: "evidence-hash",
        },
      ],
      confidence: "high",
      assumptions: ["exported store helper is treated as a governed entry point"],
      needsHumanReview: false,
      revision: REV,
      contentHash: "function-manifest-hash",
    };

    expect(manifest.exportName).toBe("readFileManifest");
    expect(manifest.fileRef).toBe("packages-core-store-ts");
    expect(manifest.contractSignature).toBe("readFileManifest(root, id) -> FileManifest | null");
    expect(manifest.evidence?.[0].path).toBe("packages/core/store.ts");
    expect(manifest.pluginPolicy).toContain("trace");
    expect(manifest.revision).toEqual(REV);
    expect(manifest.contentHash).toBe("function-manifest-hash");
  });
});
