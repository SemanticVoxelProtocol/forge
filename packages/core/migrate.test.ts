import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeHash } from "./hash.js";
import { runMigrations } from "./migrate.js";
import {
  readFileManifest,
  readFunctionManifest,
  writeFileManifest,
  writeFunctionManifest,
} from "./store.js";
import type { FileManifest } from "./file.js";
import type { FunctionManifest } from "./function.js";
import type { ArtifactVersion } from "./version.js";

const REV: ArtifactVersion = {
  rev: 1,
  parentRev: null,
  source: { type: "init" },
  timestamp: "2024-01-01T00:00:00.000Z",
};

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "svp-migrate-"));
  await mkdir(path.join(root, ".svp"), { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function makeV1FileManifest(): FileManifest {
  const base = {
    id: "file-src-legacy-ts",
    path: "src/legacy.ts",
    purpose: "Legacy governed file",
    l2BlockRef: "legacy",
    blockRefs: ["legacy"],
    exports: ["runLegacy"],
    ownership: ["src"],
    dependencyBoundary: ["src/*"],
    pluginGroups: ["governance"],
  };
  return {
    ...base,
    revision: REV,
    contentHash: computeHash(base),
  };
}

function makeV1FunctionManifest(fileRef: string): FunctionManifest {
  const base = {
    id: `${fileRef}.run-legacy`,
    fileRef,
    exportName: "runLegacy",
    signature: "runLegacy(input: LegacyInput): LegacyOutput",
    preconditions: ["input is valid"],
    postconditions: ["returns output"],
    pluginPolicy: ["governance"],
  };
  return {
    ...base,
    revision: REV,
    contentHash: computeHash(base),
  };
}

function hashArtifact(artifact: FileManifest | FunctionManifest): string {
  const { contentHash: _contentHash, revision: _revision, ...hashInput } = artifact;
  return computeHash(hashInput as Record<string, unknown>);
}

describe("runMigrations", () => {
  it("is a no-op when from === to", async () => {
    await runMigrations(root, 2, 2);
  });

  it("migrates v1 file/function manifests to v2 evidence governance", async () => {
    const file = makeV1FileManifest();
    const fn = makeV1FunctionManifest(file.id);
    await writeFileManifest(root, file);
    await writeFunctionManifest(root, fn);

    await runMigrations(root, 1, 2);

    const migratedFile = await readFileManifest(root, file.id);
    const migratedFn = await readFunctionManifest(root, fn.id);

    expect(migratedFile).toMatchObject({
      evidence: [],
      confidence: "low",
      needsHumanReview: true,
    });
    expect(migratedFile?.assumptions?.[0]).toContain("Migrated from schema v1");
    expect(migratedFile?.revision).toMatchObject({
      rev: 2,
      parentRev: 1,
      source: { type: "migration", fromSchema: "1", toSchema: "2.0.0" },
    });
    expect(migratedFile?.contentHash).toBe(hashArtifact(migratedFile!));

    expect(migratedFn).toMatchObject({
      contractSignature: fn.signature,
      evidence: [],
      confidence: "low",
      needsHumanReview: true,
    });
    expect(migratedFn?.observedSignature).toBeUndefined();
    expect(migratedFn?.assumptions?.[0]).toContain("Migrated from schema v1");
    expect(migratedFn?.revision.source).toMatchObject({ type: "migration" });
    expect(migratedFn?.contentHash).toBe(hashArtifact(migratedFn!));
  });

  it("throws when migration is missing", async () => {
    await expect(runMigrations(root, 2, 3)).rejects.toThrow("No migration found");
  });
});
