// Adapter unit tests — interface conformance, registry, and auto-detection

import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { detectHost, detectHosts } from "../adapters/detect.js";
import { getAdapter, getAllAdapterIds } from "../adapters/index.js";
import type { HostId } from "../adapters/types.js";

// ── Registry tests ──

describe("adapter registry", () => {
  it("getAllAdapterIds returns all registered hosts", () => {
    const ids = getAllAdapterIds();
    expect(ids).toContain("claude-code");
    expect(ids).toContain("kimi-code");
    expect(ids).toContain("codex");
    expect(ids).toContain("cursor");
    expect(ids).toContain("windsurf");
    expect(ids).toContain("github-copilot");
    expect(ids.length).toBe(6);
  });

  it("getAdapter returns correct adapter for each HostId", () => {
    for (const id of getAllAdapterIds()) {
      const adapter = getAdapter(id);
      expect(adapter.id).toBe(id);
      expect(adapter.displayName.length).toBeGreaterThan(0);
    }
  });

  it("getAdapter throws for unknown host", () => {
    expect(() => getAdapter("unknown" as HostId)).toThrow("Unknown host");
  });
});

// ── Interface conformance tests (all adapters) ──

describe("adapter interface conformance", () => {
  const allIds = getAllAdapterIds();

  for (const hostId of allIds) {
    describe(hostId, () => {
      const adapter = getAdapter(hostId);

      it("produces non-empty skill files (en)", () => {
        const files = adapter.generateSkillFiles("en");
        expect(files.length).toBeGreaterThan(0);
        for (const f of files) {
          expect(f.relativePath.length).toBeGreaterThan(0);
          expect(f.content.length).toBeGreaterThan(0);
        }
      });

      it("produces non-empty skill files (zh)", () => {
        const files = adapter.generateSkillFiles("zh");
        expect(files.length).toBeGreaterThan(0);
        for (const f of files) {
          expect(f.content.length).toBeGreaterThan(0);
        }
      });

      it("skill file paths are relative (no leading /)", () => {
        const files = adapter.generateSkillFiles("en");
        for (const f of files) {
          expect(f.relativePath).not.toMatch(/^\//);
        }
      });

      it("skill file paths have correct extension (.md)", () => {
        const files = adapter.generateSkillFiles("en");
        for (const f of files) {
          expect(f.relativePath).toMatch(/\.md$/);
        }
      });

      it("context section contains ## SVP marker (en)", () => {
        const section = adapter.generateContextSection("test-project", "en");
        expect(section).toContain("## SVP");
      });

      it("context section contains ## SVP marker (zh)", () => {
        const section = adapter.generateContextSection("test-project", "zh");
        expect(section).toContain("## SVP");
      });

      it("contextMarker() matches what generateContextSection produces", () => {
        const section = adapter.generateContextSection("test-project", "en");
        expect(section).toContain(adapter.contextMarker());
      });

      it("skillDir() returns a relative path", () => {
        expect(adapter.skillDir()).not.toMatch(/^\//);
      });

      it("contextFilePath() returns a relative path", () => {
        expect(adapter.contextFilePath()).not.toMatch(/^\//);
      });
    });
  }
});

// ── Workflow content consistency tests ──

/** Extract the workflow section (everything after the last "---" separator) */
function extractWorkflow(content: string): string {
  const parts = content.split("\n---\n");
  return parts.at(-1)!.trim();
}

describe("adapter workflow content consistency", () => {
  const allIds = getAllAdapterIds();

  for (const lang of ["en", "zh"] as const) {
    it(`all adapters share identical workflow content (${lang})`, () => {
      const reference = getAdapter(allIds[0]).generateSkillFiles(lang)[0].content;
      const refWorkflow = extractWorkflow(reference);

      for (const id of allIds.slice(1)) {
        const content = getAdapter(id).generateSkillFiles(lang)[0].content;
        const workflow = extractWorkflow(content);
        expect(workflow, `${id} (${lang}) workflow differs from ${allIds[0]}`).toBe(refWorkflow);
      }
    });
  }
});

// ── Auto-detection tests ──

describe("host auto-detection", () => {
  let testRoot: string;

  beforeEach(async () => {
    testRoot = path.join(
      tmpdir(),
      `svp-detect-test-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`,
    );
    await mkdir(testRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  it("detects claude-code from .claude/ directory", async () => {
    await mkdir(path.join(testRoot, ".claude"), { recursive: true });
    expect(await detectHost(testRoot)).toBe("claude-code");
  });

  it("detects cursor from .cursor/ directory", async () => {
    await mkdir(path.join(testRoot, ".cursor"), { recursive: true });
    expect(await detectHost(testRoot)).toBe("cursor");
  });

  it("detects windsurf from .windsurf/ directory", async () => {
    await mkdir(path.join(testRoot, ".windsurf"), { recursive: true });
    expect(await detectHost(testRoot)).toBe("windsurf");
  });

  it("detects kimi-code from .agents/ directory", async () => {
    await mkdir(path.join(testRoot, ".agents"), { recursive: true });
    expect(await detectHost(testRoot)).toBe("kimi-code");
  });

  it("detects codex from .codex/ directory", async () => {
    await mkdir(path.join(testRoot, ".codex"), { recursive: true });
    expect(await detectHost(testRoot)).toBe("codex");
  });

  it("detects github-copilot from .github/copilot-instructions.md file", async () => {
    await mkdir(path.join(testRoot, ".github"), { recursive: true });
    await writeFile(path.join(testRoot, ".github", "copilot-instructions.md"), "", "utf8");
    expect(await detectHost(testRoot)).toBe("github-copilot");
  });

  it("does NOT detect github-copilot from bare .github/ directory", async () => {
    await mkdir(path.join(testRoot, ".github"), { recursive: true });
    expect(await detectHost(testRoot)).toBeNull();
  });

  it("returns null when no marker directories exist", async () => {
    expect(await detectHost(testRoot)).toBeNull();
  });

  it("detectHosts returns multiple when several markers exist", async () => {
    await mkdir(path.join(testRoot, ".claude"), { recursive: true });
    await mkdir(path.join(testRoot, ".cursor"), { recursive: true });
    const hosts = await detectHosts(testRoot);
    expect(hosts).toContain("claude-code");
    expect(hosts).toContain("cursor");
    expect(hosts.length).toBe(2);
  });

  it("detectHost returns first match when multiple exist", async () => {
    await mkdir(path.join(testRoot, ".claude"), { recursive: true });
    await mkdir(path.join(testRoot, ".cursor"), { recursive: true });
    // .claude is checked first
    expect(await detectHost(testRoot)).toBe("claude-code");
  });
});
