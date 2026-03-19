import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  checkCompatibility,
  checkSchemaCompatibility,
  createManifest,
  readManifest,
  writeManifest,
} from "./manifest.js";
import type { Manifest } from "./manifest.js";

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
      schemaVersion: "1.2.3",
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
  it("auto-creates manifest for legacy project (missing manifest.json)", async () => {
    // .svp/ exists but no manifest.json
    const manifest = await checkCompatibility(testRoot);
    expect(manifest.schemaVersion).toBe(SCHEMA_VERSION);

    // Verify it was written to disk
    const onDisk = await readManifest(testRoot);
    expect(onDisk).toEqual(manifest);
  });

  it("accepts a project with current schema version", async () => {
    const original = createManifest();
    await writeManifest(testRoot, original);

    const manifest = await checkCompatibility(testRoot);
    expect(manifest.schemaVersion).toBe(SCHEMA_VERSION);
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
});
