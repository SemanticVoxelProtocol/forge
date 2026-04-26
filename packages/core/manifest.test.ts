import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeHash } from "./hash.js";
import {
  SCHEMA_VERSION,
  checkCompatibility,
  checkSchemaCompatibility,
  createManifest,
  readManifest,
  writeManifest,
} from "./manifest.js";
import { readFileManifest, writeFileManifest } from "./store.js";
import type { FileManifest } from "./file.js";
import type { Manifest } from "./manifest.js";
import type { ArtifactVersion } from "./version.js";

const REV: ArtifactVersion = {
  rev: 1,
  parentRev: null,
  source: { type: "init" },
  timestamp: "2024-01-01T00:00:00.000Z",
};

let testRoot: string;

beforeEach(async () => {
  testRoot = path.join(
    import.meta.dirname,
    `__test_manifest_${String(Date.now())}_${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(path.join(testRoot, ".svp"), { recursive: true });
});

afterEach(async () => {
  await rm(testRoot, { recursive: true, force: true });
});

describe("createManifest", () => {
  it("bumps the schema version for agent evidence governance", () => {
    expect(SCHEMA_VERSION).toBe("2.0.0");
  });

  it("creates manifest with current versions", () => {
    const manifest = createManifest();
    expect(manifest.schemaVersion).toBe(SCHEMA_VERSION);
    expect(manifest.forgeVersion).toBeTruthy();
    expect(manifest.createdAt).toBeTruthy();
    expect(manifest.updatedAt).toBeTruthy();
  });
});

describe("readManifest / writeManifest", () => {
  it("round-trips manifest through JSON", async () => {
    const manifest = createManifest();
    await writeManifest(testRoot, manifest);
    const loaded = await readManifest(testRoot);
    expect(loaded).toEqual(manifest);
  });

  it("returns null when manifest does not exist", async () => {
    const emptyRoot = path.join(testRoot, "empty");
    await mkdir(path.join(emptyRoot, ".svp"), { recursive: true });
    const loaded = await readManifest(emptyRoot);
    expect(loaded).toBeNull();
  });
});

describe("checkSchemaCompatibility", () => {
  it("returns compatible for same major version", () => {
    const manifest: Manifest = {
      schemaVersion: SCHEMA_VERSION,
      forgeVersion: "0.1.0",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const status = checkSchemaCompatibility(manifest);
    expect(status.compatible).toBe(true);
  });

  it("returns compatible for same major, different minor/patch", () => {
    const manifest: Manifest = {
      schemaVersion: "2.2.3",
      forgeVersion: "0.1.0",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    // Both have major 1
    const status = checkSchemaCompatibility(manifest);
    expect(status.compatible).toBe(true);
  });

  it("returns incompatible when manifest major > current major (downgrade)", () => {
    const manifest: Manifest = {
      schemaVersion: "99.0.0",
      forgeVersion: "99.0.0",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const status = checkSchemaCompatibility(manifest);
    expect(status.compatible).toBe(false);
    if (!status.compatible) {
      expect(status.reason).toContain("upgrade forge");
    }
  });
});

describe("checkCompatibility", () => {
  it("auto-creates manifest and migrates legacy project when manifest.json is missing", async () => {
    const legacyFile = makeV1FileManifest();
    await writeFileManifest(testRoot, legacyFile);

    // .svp/ exists but no manifest.json
    const manifest = await checkCompatibility(testRoot);
    expect(manifest.schemaVersion).toBe(SCHEMA_VERSION);

    // Verify it was written to disk
    const onDisk = await readManifest(testRoot);
    expect(onDisk).toEqual(manifest);

    const migratedFile = await readFileManifest(testRoot, legacyFile.id);
    expect(migratedFile).toMatchObject({
      evidence: [],
      confidence: "low",
      needsHumanReview: true,
    });
  });

  it("accepts a project with current schema version", async () => {
    const original = createManifest();
    await writeManifest(testRoot, original);

    const manifest = await checkCompatibility(testRoot);
    expect(manifest.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("migrates an older major schema to the current schema", async () => {
    const oldManifest: Manifest = {
      schemaVersion: "1.2.0",
      forgeVersion: "0.3.1",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };
    const legacyFile = makeV1FileManifest();
    await writeManifest(testRoot, oldManifest);
    await writeFileManifest(testRoot, legacyFile);

    const manifest = await checkCompatibility(testRoot);

    expect(manifest.schemaVersion).toBe(SCHEMA_VERSION);
    expect(manifest.createdAt).toBe(oldManifest.createdAt);
    expect(manifest.updatedAt).not.toBe(oldManifest.updatedAt);

    const migratedFile = await readFileManifest(testRoot, legacyFile.id);
    expect(migratedFile?.revision.source).toMatchObject({
      type: "migration",
      fromSchema: "1",
      toSchema: "2.0.0",
    });
  });

  it("throws on downgrade (manifest major > current)", async () => {
    const future: Manifest = {
      schemaVersion: "99.0.0",
      forgeVersion: "99.0.0",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await writeManifest(testRoot, future);

    await expect(checkCompatibility(testRoot)).rejects.toThrow("upgrade forge");
  });

  it("throws when .svp exists but is not a directory", async () => {
    const brokenRoot = path.join(testRoot, "broken-project");
    await mkdir(brokenRoot, { recursive: true });
    await writeFile(path.join(brokenRoot, ".svp"), "not a directory", "utf8");

    await expect(checkCompatibility(brokenRoot)).rejects.toThrow("exists but is not a directory");
  });
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
