// scan — Brownfield reverse generation context collector
// Walks existing codebase, extracts TS signatures, builds structured context
// for AI prompts that reverse-engineer SVP artifacts from existing code

import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { ExportedSymbol, FileFingerprint, SignatureExtractor } from "./fingerprint.js";

// ── Types ──

export interface ScanOptions {
  readonly root: string;
  readonly dir: string; // relative to root, default "src" or "."
  readonly maxFiles: number; // default 50
}

export interface ScannedFile {
  readonly filePath: string; // relative to root
  readonly exports: readonly ExportedSymbol[];
}

export interface ScanContext {
  readonly files: readonly ScannedFile[];
  readonly summary: {
    readonly totalFiles: number;
    readonly totalExports: number;
    readonly truncated: boolean;
  };
}

// ── Auto-exclude patterns ──

const EXCLUDE_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".svp",
  ".git",
  ".next",
  "coverage",
  "__pycache__",
]);

const EXCLUDE_FILE_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /\.d\.ts$/,
  /\.min\.[jt]s$/,
];

function shouldExcludeDir(name: string): boolean {
  return EXCLUDE_DIRS.has(name);
}

function shouldExcludeFile(name: string): boolean {
  return EXCLUDE_FILE_PATTERNS.some((re) => re.test(name));
}

function isTypeScriptFile(name: string): boolean {
  return /\.[jt]sx?$/.test(name) && !name.endsWith(".d.ts");
}

// ── Recursive file walker ──

async function walkDir(dir: string, root: string): Promise<string[]> {
  const result: string[] = [];

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return result;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    let s;
    try {
      s = await stat(fullPath);
    } catch {
      continue;
    }

    if (s.isDirectory()) {
      if (!shouldExcludeDir(entry)) {
        const children = await walkDir(fullPath, root);
        result.push(...children);
      }
    } else if (s.isFile() && !shouldExcludeFile(entry)) {
      result.push(path.relative(root, fullPath));
    }
  }

  return result;
}

// ── Main collector ──

/** Collect scan context from an existing codebase for reverse generation prompts */
export async function collectScanContext(
  options: ScanOptions,
  extractor?: SignatureExtractor,
): Promise<ScanContext> {
  const { root, dir, maxFiles } = options;
  const scanDir = path.resolve(root, dir);

  // Walk and collect all non-excluded files
  const allFiles = await walkDir(scanDir, root);
  allFiles.sort((a, b) => a.localeCompare(b));

  const truncated = allFiles.length > maxFiles;
  const filesToProcess = allFiles.slice(0, maxFiles);

  const scannedFiles: ScannedFile[] = [];
  let totalExports = 0;

  for (const filePath of filesToProcess) {
    if (isTypeScriptFile(filePath) && extractor !== undefined) {
      // Extract TS signatures
      const absPath = path.resolve(root, filePath);
      try {
        const fp: FileFingerprint = await extractor.extract(absPath);
        scannedFiles.push({ filePath, exports: fp.exports });
        totalExports += fp.exports.length;
      } catch {
        // If extraction fails, include path only
        scannedFiles.push({ filePath, exports: [] });
      }
    } else {
      // Non-TS files: include path only for directory structure awareness
      scannedFiles.push({ filePath, exports: [] });
    }
  }

  return {
    files: scannedFiles,
    summary: {
      totalFiles: scannedFiles.length,
      totalExports,
      truncated,
    },
  };
}
