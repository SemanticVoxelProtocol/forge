// Schema migration v1 -> v2
// Adds auditable agent-governance evidence metadata to file/function manifests.

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { computeHash } from "../hash.js";
import {
  listFileManifests,
  listFunctionManifests,
  readFileManifest,
  readFunctionManifest,
  writeFileManifest,
  writeFunctionManifest,
} from "../store.js";
import type { FileManifest } from "../file.js";
import type { FunctionManifest } from "../function.js";
import type { ArtifactVersion } from "../version.js";

const TO_SCHEMA_VERSION = "2.0.0";
const MIGRATION_ASSUMPTION =
  "Migrated from schema v1 without source evidence; agent review must refresh evidence.";

export async function v1ToV2(root: string): Promise<void> {
  await mkdir(path.join(root, ".svp", "file"), { recursive: true });
  await mkdir(path.join(root, ".svp", "fn"), { recursive: true });

  for (const id of await listFileManifests(root)) {
    const manifest = await readFileManifest(root, id);
    if (manifest === null) continue;
    await writeFileManifest(root, migrateFileManifest(manifest));
  }

  for (const id of await listFunctionManifests(root)) {
    const manifest = await readFunctionManifest(root, id);
    if (manifest === null) continue;
    await writeFunctionManifest(root, migrateFunctionManifest(manifest));
  }
}

export function migrateFileManifest(manifest: FileManifest): FileManifest {
  const migrated: FileManifest = {
    ...manifest,
    evidence: manifest.evidence ?? [],
    confidence: manifest.confidence ?? "low",
    assumptions: ensureMigrationAssumption(manifest.assumptions),
    needsHumanReview: manifest.needsHumanReview ?? true,
    revision: bumpMigrationRevision(manifest.revision),
  };

  return {
    ...migrated,
    contentHash: hashMigratedManifest(migrated),
  };
}

export function migrateFunctionManifest(manifest: FunctionManifest): FunctionManifest {
  const migrated: FunctionManifest = {
    ...manifest,
    contractSignature: manifest.contractSignature ?? manifest.signature,
    evidence: manifest.evidence ?? [],
    confidence: manifest.confidence ?? "low",
    assumptions: ensureMigrationAssumption(manifest.assumptions),
    needsHumanReview: manifest.needsHumanReview ?? true,
    revision: bumpMigrationRevision(manifest.revision),
  };

  return {
    ...migrated,
    contentHash: hashMigratedManifest(migrated),
  };
}

function ensureMigrationAssumption(existing: readonly string[] | undefined): readonly string[] {
  if (existing === undefined || existing.length === 0) return [MIGRATION_ASSUMPTION];
  return existing.includes(MIGRATION_ASSUMPTION) ? existing : [...existing, MIGRATION_ASSUMPTION];
}

function bumpMigrationRevision(revision: ArtifactVersion): ArtifactVersion {
  return {
    rev: revision.rev + 1,
    parentRev: revision.rev,
    source: { type: "migration", fromSchema: "1", toSchema: TO_SCHEMA_VERSION },
    timestamp: new Date().toISOString(),
  };
}

function hashMigratedManifest(manifest: FileManifest | FunctionManifest): string {
  const { contentHash: _contentHash, revision: _revision, ...hashInput } = manifest;
  return computeHash(hashInput as Record<string, unknown>);
}
