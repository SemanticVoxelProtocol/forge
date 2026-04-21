// scan — Brownfield reverse generation context collector
// Walks existing codebase, builds structured context
// for AI prompts that reverse-engineer SVP artifacts from existing code

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

// ── Types ──

export interface ScanOptions {
  readonly root: string;
  readonly dir: string; // relative to root, default "src" or "."
  readonly maxFiles: number; // default 50
}

export interface ScannedFile {
  readonly filePath: string; // relative to root
  // Exported function candidate names only.
  // This is intentionally narrower than "all exports": constants, classes,
  // and re-export lists are excluded from this scan context.
  readonly exportNames: readonly string[];
}

export interface ScanContext {
  readonly files: readonly ScannedFile[];
  readonly summary: {
    readonly totalFiles: number;
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

const EXCLUDE_FILE_PATTERNS = [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /\.d\.ts$/, /\.min\.[jt]s$/];
const EXPORT_SCAN_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
]);

function shouldExcludeDir(name: string): boolean {
  return EXCLUDE_DIRS.has(name);
}

function shouldExcludeFile(name: string): boolean {
  return EXCLUDE_FILE_PATTERNS.some((re) => re.test(name));
}

function shouldScanExports(filePath: string): boolean {
  return EXPORT_SCAN_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function extractExportNames(content: string): string[] {
  const exportNames = new Set<string>();

  // Brownfield scan only tracks exported function candidates for follow-on
  // file/function governance prompts. It does not try to enumerate every
  // export form in the source file.
  for (const match of content.matchAll(/\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) {
    exportNames.add(match[1]);
  }

  return [...exportNames].toSorted();
}

async function scanFile(root: string, filePath: string): Promise<ScannedFile> {
  if (!shouldScanExports(filePath)) {
    return { filePath, exportNames: [] };
  }

  try {
    const content = await readFile(path.join(root, filePath), "utf8");
    const exportNames = extractExportNames(content);
    return { filePath, exportNames };
  } catch {
    return { filePath, exportNames: [] };
  }
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
export async function collectScanContext(options: ScanOptions): Promise<ScanContext> {
  const { root, dir, maxFiles } = options;
  const scanDir = path.resolve(root, dir);

  // Walk and collect all non-excluded files
  const allFiles = await walkDir(scanDir, root);
  allFiles.sort((a, b) => a.localeCompare(b));

  const truncated = allFiles.length > maxFiles;
  const filesToProcess = allFiles.slice(0, maxFiles);

  const scannedFiles = await Promise.all(
    filesToProcess.map(async (filePath) => scanFile(root, filePath)),
  );

  return {
    files: scannedFiles,
    summary: {
      totalFiles: scannedFiles.length,
      truncated,
    },
  };
}
