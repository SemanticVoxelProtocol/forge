// .svp/manifest.json — schema versioning and compatibility checks

import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { VERSION } from "./version.js";

/** Current schema version for the .svp/ data model */
export const SCHEMA_VERSION = "1.1.0";

export interface Manifest {
  readonly schemaVersion: string;
  readonly forgeVersion: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type CompatibilityStatus =
  | { readonly compatible: true }
  | { readonly compatible: false; readonly reason: string };

const SVP_DIR = ".svp";
const MANIFEST_FILE = "manifest.json";

function manifestPath(root: string): string {
  return path.join(root, SVP_DIR, MANIFEST_FILE);
}

/** Parse major version number from a semver string */
function major(version: string): number {
  const m = /^(\d+)/.exec(version);
  return m ? Number(m[1]) : 0;
}

/** Read manifest.json, returns null if missing */
export async function readManifest(root: string): Promise<Manifest | null> {
  try {
    const content = await readFile(manifestPath(root), "utf8");
    return JSON.parse(content) as Manifest;
  } catch {
    return null;
  }
}

/** Write manifest.json */
export async function writeManifest(root: string, manifest: Manifest): Promise<void> {
  await writeFile(manifestPath(root), JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

/** Create a fresh manifest with current versions */
export function createManifest(): Manifest {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    forgeVersion: VERSION,
    createdAt: now,
    updatedAt: now,
  };
}

/** Update the manifest's forgeVersion and updatedAt timestamp */
export function touchManifest(manifest: Manifest): Manifest {
  return {
    ...manifest,
    forgeVersion: VERSION,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Check compatibility between manifest schema version and current SCHEMA_VERSION.
 * Returns a status object indicating whether the project is compatible.
 */
export function checkSchemaCompatibility(manifest: Manifest): CompatibilityStatus {
  const currentMajor = major(SCHEMA_VERSION);
  const manifestMajor = major(manifest.schemaVersion);

  if (manifestMajor === currentMajor) {
    return { compatible: true };
  }

  if (manifestMajor > currentMajor) {
    return {
      compatible: false,
      reason:
        `This project uses schema v${manifest.schemaVersion} but forge v${VERSION} ` +
        `only supports schema v${SCHEMA_VERSION}. Please upgrade forge.`,
    };
  }

  // manifestMajor < currentMajor → migration needed
  // For now this is treated as compatible since migration will handle it.
  // The migrate module will do the actual work.
  return { compatible: true };
}

/**
 * Ensure the .svp/ directory has a valid, compatible manifest.
 * - Missing manifest → auto-create (legacy project)
 * - Incompatible → throw with reason
 * - Needs migration → run migrations, update manifest
 *
 * Returns the (possibly updated) manifest.
 */
export async function checkCompatibility(root: string): Promise<Manifest> {
  // If .svp/ doesn't exist at all, nothing to check (not an initialized project)
  try {
    const s = await stat(path.join(root, SVP_DIR));
    if (!s.isDirectory()) return createManifest();
  } catch {
    return createManifest();
  }

  let manifest = await readManifest(root);

  if (manifest === null) {
    // Legacy project without manifest — create one at v1.0.0
    manifest = createManifest();
    await writeManifest(root, manifest);
    return manifest;
  }

  const status = checkSchemaCompatibility(manifest);
  if (!status.compatible) {
    throw new Error(status.reason);
  }

  const currentMajor = major(SCHEMA_VERSION);
  const manifestMajor = major(manifest.schemaVersion);

  if (manifestMajor < currentMajor) {
    // Run migrations
    const { runMigrations } = await import("./migrate.js");
    await runMigrations(root, manifestMajor, currentMajor);

    // Update manifest to current schema
    manifest = {
      ...manifest,
      schemaVersion: SCHEMA_VERSION,
      forgeVersion: VERSION,
      updatedAt: new Date().toISOString(),
    };
    await writeManifest(root, manifest);
  }

  return manifest;
}
